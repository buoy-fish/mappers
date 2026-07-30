defmodule MappersWeb.OgMeta do
  @moduledoc """
  Builds Open Graph / Twitter-card metadata for the SPA shell (rendered into the
  layout `<head>` per request).

  Default shares get a branded preview card. A Timeline deep-link (`?play=...`)
  gets a tailored title/description and, when it carries the sender's camera
  (`lat`/`lng`/`zoom`) and a Mapbox token is available, a satellite preview of
  the exact framed area via the Mapbox Static Images API. A project deep-link
  (`/<project-slug>[/<flag>...]`) gets the project named in the title on the
  branded card. Anything missing or invalid degrades to the branded card.

  Pure and free of Plug/Conn — the controller supplies `base_url`, `page_url`,
  `path_info`, and `mapbox_token` so this stays trivially unit-testable.
  """

  @default_title "Buoy.Fish Coverage Map"
  @default_description "LoRaWAN coverage for the Buoy.Fish IoT network — live RSSI hex coverage, mapped."
  @card_path "/images/og-cover.png"
  @mapbox_static "https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static"

  @doc """
  `params` is the string-keyed query-param map. Options:

    * `:base_url`     — canonical origin, e.g. `"https://map.buoy.fish"` (required)
    * `:page_url`     — full current URL (defaults to `base_url`)
    * `:path_info`    — request path segments (e.g. `["gulf-of-nicoya", "show-gateways"]`)
    * `:mapbox_token` — public `pk.` token for the static satellite image

  Returns `%{title, description, image, url}` (all binaries).
  """
  def build(params, opts) do
    base_url = Keyword.fetch!(opts, :base_url)
    page_url = Keyword.get(opts, :page_url, base_url)
    token = Keyword.get(opts, :mapbox_token)
    card = base_url <> @card_path

    cond do
      is_binary(params["play"]) and params["play"] != "" ->
        %{
          title: humanize(params["play"]) <> " coverage timeline · Buoy.Fish",
          description: timeline_description(params),
          image: timeline_image(params, token) || card,
          url: page_url
        }

      project = MappersWeb.DeepLink.project_slug(Keyword.get(opts, :path_info)) ->
        name = humanize(project)

        %{
          title: name <> " coverage · Buoy.Fish",
          description: "LoRaWAN coverage for #{name} on the Buoy.Fish map.",
          image: card,
          url: page_url
        }

      true ->
        %{
          title: @default_title,
          description: @default_description,
          image: card,
          url: base_url <> "/"
        }
    end
  end

  # "punta-eugenia-baja" -> "Punta Eugenia Baja". Sanitized so a hostile slug
  # can't inject anything (the layout also HTML-escapes on render).
  defp humanize(slug) do
    slug
    |> String.replace(~r/[^A-Za-z0-9\- ]/, "")
    |> String.split(["-", " "], trim: true)
    |> Enum.map_join(" ", &String.capitalize/1)
  end

  defp timeline_description(params) do
    case {safe_date(params["start"]), safe_date(params["end"])} do
      {start, finish} when is_binary(start) and is_binary(finish) ->
        "Watch coverage bloom from #{start} to #{finish} on the Buoy.Fish map."

      _ ->
        "Watch this coverage bloom on the Buoy.Fish map."
    end
  end

  defp safe_date(s) when is_binary(s) do
    if Regex.match?(~r/^\d{4}-\d{2}-\d{2}$/, s), do: s, else: nil
  end

  defp safe_date(_), do: nil

  # Mapbox Static Images: /static/{lon},{lat},{zoom}/{w}x{h}?access_token=...
  defp timeline_image(params, token) when is_binary(token) and token != "" do
    with {:ok, lng} <- num(params["lng"], -180, 180),
         {:ok, lat} <- num(params["lat"], -90, 90),
         {:ok, zoom} <- num(params["zoom"], 0, 22) do
      "#{@mapbox_static}/#{fmt(lng)},#{fmt(lat)},#{fmt(zoom)}/1200x630?access_token=#{token}"
    else
      _ -> nil
    end
  end

  defp timeline_image(_params, _token), do: nil

  defp num(s, min, max) when is_binary(s) do
    case Float.parse(s) do
      {n, _} when n >= min and n <= max -> {:ok, n}
      _ -> :error
    end
  end

  defp num(_, _, _), do: :error

  # Trim trailing zeros so the URL reads "44.5" not "44.50000".
  defp fmt(n) do
    n
    |> Float.round(5)
    |> :erlang.float_to_binary([:compact, decimals: 5])
  end
end
