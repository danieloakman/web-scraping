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
    # export PLAYWRIGHT_LAUNCH_OPTIONS_EXECUTABLE_PATH="${pkgs.playwright.browsers}/chromium-1169/chrome-linux/chrome";
    export SHELL=${pkgs.zsh}/bin/zsh
    exec ${pkgs.zsh}/bin/zsh
  '';
}