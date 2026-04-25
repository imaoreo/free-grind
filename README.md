<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Open Grind Icon" width="150" height="150">
</p>

<p align="center">
  <a href="https://discord.gg/cJqTaWPMFF"><img src="https://img.shields.io/discord/1496182396033175823?label=Discord&logo=discord" alt="Discord"></a>
  <a href="https://t.me/opengrind"><img src="https://img.shields.io/badge/Telegram-2CA5E0?style=flat&logo=telegram&logoColor=white" alt="Telegram"></a>
  <a href="https://github.com/kezza2k7/open-grind/releases"><img src="https://img.shields.io/github/v/release/kezza2k7/open-grind?logo=github&label=Release" alt="Latest Release"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Personal%20Use-blue" alt="License"></a>
  <a href="https://github.com/kezza2k7/open-grind/issues"><img src="https://img.shields.io/github/issues/kezza2k7/open-grind?label=Issues" alt="Issues"></a>
</p>

<h1 align="center">Open Grind</h1>

<p align="center">
An unofficial, cross-platform Grindr client — free, libre, ad-free, tracker-free, and community-driven.
</p>

## Introduction

Open Grind is a fully independent Grindr client built with [Tauri](https://tauri.app/) and React, running the same codebase on Windows, Linux, macOS, Android, and iOS. It is not a mod or patch of the official app — it communicates directly with the Grindr API as a native client.

The goal is to provide a privacy-respecting, open, and extensible alternative to the official client, without ads, trackers, or forced upsells.

Open Grind is under active development. Stability is not always guaranteed, and some features are still in progress. See [ROADMAP.md](./ROADMAP.md) for what's planned.

Neither the maintainers nor contributors are affiliated with Grindr LLC.

## Disclaimer

This project is provided with no warranty of any kind. Use at your own risk. We are not responsible for lost chats, account issues, unexpected bans, or any other problems arising from use of this software.

Open Grind does not collect personal data, display ads, or generate revenue of any kind. This project is open source — you can verify all of this yourself.

## Downloads

- Download the latest stable release from the [releases page](https://github.com/kezza2k7/open-grind/releases).
- You can build the latest version yourself by following the [Development](#development) guide below.

## Features

<details closed>
  <summary>Browse</summary>

  - `Nearby profile grid (cascade view)`
  - `Profile detail modal with full stats`
  - `Location spoofing / manual location picker`
  - `Search profiles with filters`
</details>

<details closed>
  <summary>Chat</summary>

  - `Full inbox with conversation list`
  - `Real-time messaging via WebSocket`
  - `Text messages, image sharing, albums`
  - `Pin, mute, and delete conversations`
  - `Message reactions`
  - `Inbox filters (unread, favorites, online, etc.)`
</details>

<details closed>
  <summary>Profiles</summary>

  - `Full profile viewer (stats, health, tribes, tags)`
  - `Profile photo gallery`
  - `Edit your own profile`
  - `Manage profile photos`
</details>

<details closed>
  <summary>Privacy & Freedom</summary>

  - `Zero ads`
  - `Zero trackers`
  - `No forced upsells`
  - `No artificial profile limits`
</details>

## Bugs

> [!WARNING]
> Please read this section before reporting bugs. Some issues are known limitations of the current development stage.

- **Android / iOS**: Mobile builds are functional but less tested than desktop.
- **Media uploads**: Binary upload support requires correct content-type handling; some edge cases may fail.
- **Real-time events**: Some WebSocket event types are still WIP and may not be handled.
- **Profile fields**: Some server-side fields are undocumented and may display incorrectly.

> [!TIP]
> Before reporting a bug, check the [issues](https://github.com/kezza2k7/open-grind/issues) page to see if it's already known.

## Development

Interested in contributing? Head to [CONTRIBUTING.md](./CONTRIBUTING.md) to get started.

All contributions must be aligned with [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

The API reference documentation lives in [`docs/`](./docs/content/grindr-api/) and is hosted at [https://opengrind.imaoreo.dev/](https://opengrind.imaoreo.dev/) — contributions to reverse engineering and documentation are especially valued.

## FAQ & Troubleshooting

<details>
  <summary>Can I get banned for using this?</summary>

  Using any unofficial client [technically violates Grindr's Terms of Service](https://www.grindr.com/terms-of-service). The risk is low, but it exists. Use at your own discretion.
</details>

<details>
  <summary>Does this work on iOS?</summary>

  iOS builds are supported via Tauri but are less tested. You will need to build from source and sideload the app.
</details>

<details>
  <summary>Why isn't feature X implemented yet?</summary>

  Open Grind is community-driven and under active development. Check the [ROADMAP.md](./ROADMAP.md) for planned features, or open a [feature request](https://github.com/kezza2k7/open-grind/issues).
</details>

<details>
  <summary>Where is the API documentation?</summary>

  The Grindr API reference is maintained in this repo under [`docs/content/grindr-api/`](./docs/content/grindr-api/) and hosted at [opengrind.imaoreo.dev](https://opengrind.imaoreo.dev).
</details>

## Contributing

This project is open to all kinds of contributions — code, documentation, bug reports, and reverse engineering. Feel free to [open a pull request](https://github.com/kezza2k7/open-grind/pulls) or [submit an issue](https://github.com/kezza2k7/open-grind/issues).

## Donate

If you'd like to support the project, see [FUNDING.md](./FUNDING.md).

## License

[Personal Use Licence](./LICENSE)
