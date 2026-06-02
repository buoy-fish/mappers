defmodule MappersWeb.OgMetaTest do
  use ExUnit.Case, async: true

  alias MappersWeb.OgMeta

  @base "https://map.buoy.fish"
  @opts [base_url: @base, page_url: @base <> "/?play=x", mapbox_token: "pk.test"]

  describe "default (non-timeline) meta" do
    test "uses the branded card and default title/url" do
      meta = OgMeta.build(%{}, base_url: @base, page_url: @base <> "/")
      assert meta.title == "Buoy.Fish Coverage Map"
      assert meta.image == @base <> "/images/og-cover.png"
      assert meta.url == @base <> "/"
      assert meta.description =~ "coverage"
    end

    test "an empty play is treated as non-timeline" do
      meta = OgMeta.build(%{"play" => ""}, base_url: @base)
      assert meta.title == "Buoy.Fish Coverage Map"
      assert meta.image == @base <> "/images/og-cover.png"
    end
  end

  describe "timeline deep-link meta" do
    test "humanizes the project slug into the title" do
      meta = OgMeta.build(%{"play" => "punta-eugenia-baja"}, @opts)
      assert meta.title == "Punta Eugenia Baja coverage timeline · Buoy.Fish"
    end

    test "includes the date window in the description when valid" do
      meta =
        OgMeta.build(
          %{"play" => "x", "start" => "2026-05-01", "end" => "2026-06-02"},
          @opts
        )

      assert meta.description =~ "2026-05-01"
      assert meta.description =~ "2026-06-02"
    end

    test "ignores malformed dates in the description" do
      meta = OgMeta.build(%{"play" => "x", "start" => "garbage", "end" => "2026-06-02"}, @opts)
      refute meta.description =~ "garbage"
    end

    test "with coords + token, image is a Mapbox static URL at the link's camera" do
      meta =
        OgMeta.build(
          %{"play" => "x", "lat" => "44.5", "lng" => "-68.5", "zoom" => "8"},
          @opts
        )

      assert meta.image =~ "api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/"
      assert meta.image =~ "-68.5,44.5,8"
      assert meta.image =~ "access_token=pk.test"
    end

    test "uses the page_url (full deep-link) as og:url" do
      meta = OgMeta.build(%{"play" => "x"}, @opts)
      assert meta.url == @base <> "/?play=x"
    end

    test "falls back to the branded card when no Mapbox token" do
      meta =
        OgMeta.build(
          %{"play" => "x", "lat" => "44.5", "lng" => "-68.5", "zoom" => "8"},
          base_url: @base, mapbox_token: nil
        )

      assert meta.image == @base <> "/images/og-cover.png"
    end

    test "falls back to the branded card when coords are out of range" do
      meta =
        OgMeta.build(
          %{"play" => "x", "lat" => "999", "lng" => "-68.5", "zoom" => "8"},
          @opts
        )

      assert meta.image == @base <> "/images/og-cover.png"
    end
  end
end
