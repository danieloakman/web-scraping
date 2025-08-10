{
  description = "web-scraping dev shell (flake) with pinned playwright-driver";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = { self, nixpkgs }: let
    system = "x86_64-linux";
    pkgs = import nixpkgs { inherit system; };
  in (let shell = pkgs.mkShell {
      name = "web-scraping";
      NIX_BUILD_SHELL = "${pkgs.zsh}/bin/zsh";
      packages = with pkgs; [
        bun
        nodejs_24
        playwright-driver
      ];
      shellHook = ''
        export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
        export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}

        # Drop into zsh for interactive sessions only (does not affect --run)
        export SHELL=${pkgs.zsh}/bin/zsh
        if [[ $- == *i* ]]; then
          exec "$SHELL"
        fi
      '';
    }; in {
    devShells.${system}.default = shell;
    # packages.${system}.default = shell;
  });
}
