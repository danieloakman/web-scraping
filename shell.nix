{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  name = "web-scraping";
  NIX_BUILD_SHELL = "${pkgs.zsh}/bin/zsh";
  packages = with pkgs; [
    bun
    nodejs_22
    playwright-driver
  ];
  shellHook = ''
    export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
    export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}

    bun i
  '';
}