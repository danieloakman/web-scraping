{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  name = "web-scraping";
  buildInputs = with pkgs; [
    bun
    nodejs_22
    playwright-driver
  ];
  shellHook = ''
    export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
    export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
    export SHELL=${pkgs.zsh}/bin/zsh

    bun i

    exec ${pkgs.zsh}/bin/zsh
  '';
}