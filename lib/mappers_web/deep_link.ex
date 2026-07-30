defmodule MappersWeb.DeepLink do
  @moduledoc """
  The server-side vocabulary of SPA deep-link paths — `/<project-slug>[/<flag>...]`.

  ONE home for the two lists, because they had drifted into three: the plug that
  404s non-SPA prefixes, the controller that mounted the shell, and `OgMeta` each
  carried their own copy, and the controller's was missing five entries while its
  comment claimed to mirror the others.

  These lists mirror `VIEW_FLAG_SLUGS` and `RESERVED` in
  `assets/js/utils/projectLink.js`, which is the client-side half of the same
  contract (see CLAUDE.md → "Shareable URLs"). Keep the two languages in step.
  """

  # Display-toggle segments. Skipped when looking for the project slug, so
  # `/gulf-of-nicoya/show-gateways` still titles as the project.
  @flag_slugs ~w(show-gateways hide-coverage show-mobile-hexes)

  # First path segments owned by something other than a project view: existing
  # SPA routes, API scopes, the tile proxy, and the prefixes Plug.Static serves.
  # A path under one of these is never a deep-link, however deep it goes —
  # `/metrics` is an exact route, but `/metrics/anything` is not, and must 404
  # rather than fall through to the catch-all and mount the shell.
  @reserved_segments ~w(uplinks api tiles metrics dashboard socket live css js
                        images fonts favicon.ico robots.txt)

  # Project codes are lowercase kebab-case (the `code` column served by
  # app.buoy.fish /api/v1/public/projects).
  @slug_re ~r/^[a-z0-9][a-z0-9-]*$/

  @doc "Display-toggle slugs, in legend order."
  def flag_slugs, do: @flag_slugs

  @doc "First path segments that belong to another route."
  def reserved_segments, do: @reserved_segments

  @doc """
  True when the first path segment belongs to another route entirely.

  Note this is deliberately NOT the same question as "is this a deep-link":
  `/uplinks/hex/:id` is reserved here yet still serves the SPA, because its own
  route matches earlier in the router.
  """
  def reserved_path?([first | _]) when is_binary(first), do: first in @reserved_segments
  def reserved_path?(_), do: false

  @doc """
  The project slug of a view deep-link, or nil.

  Mirrors `parseProjectLink` in assets/js/utils/projectLink.js: a reserved first
  segment disqualifies the path, flag segments are skipped, and the first
  remaining segment must be lowercase kebab-case to count.
  """
  def project_slug([first | _] = segments) when is_binary(first) do
    if reserved_path?(segments) do
      nil
    else
      segments
      |> Enum.reject(&(&1 in @flag_slugs))
      |> List.first()
      |> valid_slug()
    end
  end

  def project_slug(_), do: nil

  defp valid_slug(s) when is_binary(s) do
    if Regex.match?(@slug_re, s), do: s, else: nil
  end

  defp valid_slug(_), do: nil
end
