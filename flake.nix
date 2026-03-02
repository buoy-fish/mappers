{
  description = "Buoy.Fish Coverage Mapper (map.buoy.fish)";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    flake-utils.url = "github:numtide/flake-utils";
  };
  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config = {
            allowUnfree = true;
          };
        };
        darwinSdk = pkgs.darwin.apple_sdk.frameworks;
        beamPackages = pkgs.beam.packages.erlang_27;

        getSystemPackages = system: with pkgs; [
          beamPackages.elixir_1_18
          beamPackages.erlang
          nodejs_20
          postgresql
          cmake       # Required by h3 Erlang NIF (native C compilation)
          gcc
          git
        ] ++ (if system == "x86_64-darwin" || system == "aarch64-darwin" then [
          darwinSdk.CoreFoundation
          darwinSdk.CoreServices
        ] else [
          inotify-tools
        ]);
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = getSystemPackages system;
          shellHook = ''
            export MIX_HOME=$HOME/.nix-mix
            export HEX_HOME=$HOME/.nix-hex
            export PATH=$MIX_HOME/bin:$PATH
            export PATH=$HEX_HOME/bin:$PATH
            export LANG=C.UTF-8
            export ERL_AFLAGS="-kernel shell_history enabled"

            # Set MACOSX_DEPLOYMENT_TARGET for MacOS
            if [[ "$OSTYPE" == "darwin"* ]]; then
              export MACOSX_DEPLOYMENT_TARGET=11.0
            fi
            # Set LIBRARY_PATH for MacOS
            if [[ "$OSTYPE" == "darwin"* ]]; then
              export LIBRARY_PATH=$LIBRARY_PATH:${pkgs.darwin.Libsystem}/lib
            fi

            # Load environment variables from .env file
            if [ -f .env ]; then
              echo "Loading environment from .env..."
              set -a
              source .env
              set +a
            elif [ -f .env.development ]; then
              echo "Loading environment from .env.development..."
              set -a
              source .env.development
              set +a
            fi

            # Ensure essential mix tools are available
            (
              MIX_ENV=prod mix local.hex --force --if-missing
              MIX_ENV=prod mix local.rebar --force --if-missing
            ) 2>/dev/null || true
          '';
        };
      });
}
