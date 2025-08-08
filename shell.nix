{ pkgs ? import <nixpkgs> {} }:
let
  thisFile = (builtins.unsafeGetAttrPos "here" { here = null; }).file;
  thisDir = builtins.dirOf thisFile;
in
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

    # Export CWD to the directory containing this shell.nix
    export CWD='${thisDir}'

    cd $CWD && bun i && cd -

    # Drop into zsh for interactive sessions only (does not affect --run)
    export SHELL=${pkgs.zsh}/bin/zsh
    if [[ $- == *i* ]]; then
      exec "$SHELL"
    fi
  '';
}