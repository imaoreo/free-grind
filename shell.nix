{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  packages = with pkgs; [
    git
    nodejs_22
    pnpm
    pkg-config
    rustup
    zlib
    openssl
  ];

  shellHook = ''
    export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
    export PATH="$HOME/.cargo/bin:$PATH"
    echo "Free Grind Nix shell ready."
  '';
}