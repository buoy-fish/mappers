defmodule MappersWeb.DeepLinkTest do
  use ExUnit.Case, async: true

  alias MappersWeb.DeepLink

  # The deep-link vocabulary is spelled twice — once in Elixir, once in the JS
  # codec — because both halves of the contract need it and they can't share a
  # module. Comments saying "keep these in sync" are what let the two drift into
  # three lists, one of them missing five entries. These tests read the JS source
  # and enforce it instead.
  @js_path Path.expand("../../assets/js/utils/projectLink.js", __DIR__)

  defp js_list(header) do
    source = File.read!(@js_path)
    [_, body] = Regex.run(~r/#{header}([^\]]*)\]/s, source)

    Regex.scan(~r/'([^']+)'/, body)
    |> Enum.map(fn [_, s] -> s end)
  end

  describe "vocabulary parity with assets/js/utils/projectLink.js" do
    test "flag slugs match, in the same order" do
      js = js_list("VIEW_FLAG_SLUGS = \\[")
      assert js != []
      assert DeepLink.flag_slugs() == js
    end

    test "reserved segments match" do
      js = js_list("RESERVED = new Set\\(\\[")
      assert js != []
      assert Enum.sort(DeepLink.reserved_segments()) == Enum.sort(js)
    end
  end

  describe "project_slug/1" do
    test "takes the first non-flag segment" do
      assert DeepLink.project_slug(["gulf-of-nicoya"]) == "gulf-of-nicoya"
      assert DeepLink.project_slug(["gulf-of-nicoya", "show-gateways"]) == "gulf-of-nicoya"
      assert DeepLink.project_slug(["show-gateways", "gulf-of-nicoya"]) == "gulf-of-nicoya"
    end

    test "a flags-only path has no project" do
      assert DeepLink.project_slug(["show-gateways", "hide-coverage"]) == nil
    end

    test "reserved prefixes and malformed slugs have no project" do
      assert DeepLink.project_slug(["uplinks", "hex", "8928308280fffff"]) == nil
      assert DeepLink.project_slug(["api", "v1", "hexes"]) == nil
      assert DeepLink.project_slug(["Not A Slug"]) == nil
      assert DeepLink.project_slug([]) == nil
    end
  end

  describe "reserved_path?/1" do
    test "keys off the first segment only, however deep the path goes" do
      assert DeepLink.reserved_path?(["metrics", "anything"])
      assert DeepLink.reserved_path?(["api", "v1", "bogus"])
      refute DeepLink.reserved_path?(["gulf-of-nicoya", "show-gateways"])
      refute DeepLink.reserved_path?([])
    end
  end
end
