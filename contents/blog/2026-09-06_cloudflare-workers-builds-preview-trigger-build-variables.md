---
title: Cloudflare Workers Builds のビルド変数は、ダッシュボードから設定しても非本番ブランチには入らない
slug: cloudflare-workers-builds-preview-trigger-build-variables
date: 2026-09-06
modified_time: 2026-09-06
description: Bun 1.4 で bun.lock の形式が 2 に上がり、Cloudflare Workers Builds の非本番ブランチのビルドだけが止まりました。ビルド環境の Bun が古いことが原因でしたが、ダッシュボードで BUN_VERSION を設定しても直りません。ビルド設定が本番とプレビューの 2 つのトリガーに分かれて保存されている仕組みと、REST API での修正手順を紹介します。
icon: 👯
icon_url: 
tags:
  - CloudflareWorkers
  - Bun
  - CI
---

Cloudflare Workers Builds は、GitHub のリポジトリと連携させておくと、push のたびにビルドとデプロイを実行してくれます。ビルドに使う変数は、ダッシュボードの「設定 > ビルド > 変数とシークレット」から追加できます。私はここに `BUN_VERSION` を入れて、ビルド環境の Bun のバージョンを固定していました。

Bun を 1.4 系へ上げたときも、この欄の値を書き換えました。`main` へマージしたビルドは成功します。ところが `main` 以外のブランチへ push したビルドだけは、依存関係のインストールで止まったままでした。同じリポジトリ、同じ `bun.lock`、同じビルドコマンドで、違いはブランチだけです。

原因は 2 つ重なっていました。Bun 1.4 でロックファイルの形式が変わったこと、そして Workers Builds のビルド設定が本番用とプレビュー用の 2 つに分かれて保存されていることです。この記事では、失敗の切り分けから REST API での修正までを書きます。

<!-- textlint-disable preset-ja-technical-writing/no-unmatched-pair -->

>[!NOTE]
>2026 年 9 月 6 日に確認した内容です。Cloudflare のビルドイメージの既定は Bun 1.2.15 / Node.js 24.18.0、リポジトリ側の Bun は 1.4.0 です。ビルドイメージの既定バージョンは今後変わる可能性があります。

<!-- textlint-enable preset-ja-technical-writing/no-unmatched-pair -->

## 非本番ブランチだけで起きた失敗

失敗したビルドのログです。依存関係のインストールに入ってすぐ止まっています。

```
Detected the following tools from environment: bun@1.2.15, nodejs@24.18.0
Installing project dependencies: bun install --frozen-lockfile
bun install v1.2.15 (df017990)
2 |   "lockfileVersion": 2,
                         ^
error: Unknown lockfile version
    at bun.lock:2:22
UnknownLockfileVersion: failed to parse lockfile: 'bun.lock'

warn: Ignoring lockfile
error: lockfile had changes, but lockfile is frozen
Failed: error occurred while installing tools or dependencies
```

`bun.lock` には形式の番号があり、Bun のリファレンスでは [`lockfileVersion`](https://bun.com/reference/bun/BunLockFile/lockfileVersion) の型が `0 | 1 | 2` です。`Unknown lockfile version` は、そこに書かれた番号をその Bun が知らないときのエラーでした。ログのロックファイルは 2、読もうとした Bun は 1.2.15 です。

もう 1 か所、`Detected the following tools from environment:` の行には、そのビルドで使われる Bun と Node.js のバージョンが出ます。ここが `bun@1.2.15` です。`main` へ push したときのビルドで同じ行を見ると `bun@1.4.0` でした。ブランチによって、ビルド環境に入る Bun が違っていたことになります。

## `bun.lock` の形式が 2 に上がった境目

Bun 1.4.0 は 2026 年 8 月 19 日にリリースされました。破壊的変更をまとめた [oven-sh/bun#28792](https://github.com/oven-sh/bun/issues/28792) に、次の項目があります。

> `bun.lock` default `lockfileVersion` is now `2` (#31539). (中略)Existing v0/v1 lockfiles continue to load. Older Bun versions cannot read v2 lockfiles.

新しい Bun は古い形式のロックファイルを読めますが、古い Bun は新しい形式を読めません。互換性は片方向です。

境目のバージョンを手元で確かめました。依存を `is-number@7.0.0` だけにした同じ `package.json` を 2 つのディレクトリに置き、片方を Bun 1.3.14、もう片方を Bun 1.4.0 でインストールします。生成された `bun.lock` の 2 行目を見比べます。

```bash
bunx bun@1.3.14 install --cwd probe/bun-1.3.14
bunx bun@1.4.0 install --cwd probe/bun-1.4.0
head -2 probe/bun-1.3.14/bun.lock probe/bun-1.4.0/bun.lock
```

```
==> probe/bun-1.3.14/bun.lock <==
{
  "lockfileVersion": 1,

==> probe/bun-1.4.0/bun.lock <==
{
  "lockfileVersion": 2,
```

1.3 系の最終版である 1.3.14 はまだ 1 を書き、2 を書き始めるのは 1.4 からでした。同じ結果は [vercel/turborepo の Discussion #13126](https://github.com/vercel/turborepo/discussions/13126) でも報告されています。

Cloudflare のビルドログと同じエラーは、Cloudflare を経由しなくても手元で出せます。形式 2 の `bun.lock` と、それに対応する `package.json` を `repro/` へ置き、古い Bun でインストールを実行しました。

```bash
bunx bun@1.2.15 install --cwd repro --frozen-lockfile
```

```
bun install v1.2.15 (df017990)
2 |   "lockfileVersion": 2,
                         ^
error: Unknown lockfile version
    at bun.lock:2:22
UnknownLockfileVersion: failed to parse lockfile: 'bun.lock'

warn: Ignoring lockfile
error: lockfile had changes, but lockfile is frozen
```

ビルドログと 1 行も違いません。失敗の直接の原因は、形式 2 のロックファイルを Bun 1.2.15 が読めないことでした。

`bun.lock` の形式を決めるのは、それを書き出した Bun のバージョンです。手元の Bun を 1.4 系へ上げて `bun install` を一度実行すると、ロックファイルは形式 2 に書き換わり、その差分がコミットに乗ります。リポジトリが形式 2 へ移った時点で、古い Bun でインストールする環境は止まります。

## ビルド環境の Bun のバージョンを決める場所

Workers Builds のビルドイメージに最初から入っている Bun は 1.2.15 です。[Build image のドキュメント](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)に、ツールごとの既定バージョンと、それを上書きする方法が載っています。

上書きの手段は 2 通りあります。ビルド変数で指定するか、決められた名前のファイルをリポジトリに置くかです。ファイル名の一覧が載っているのはランタイムの表だけで、Node.js には `.nvmrc` と `.node-version`、Python には `.python-version` と `runtime.txt` が並んでいます。Bun があるのはもう一方の表で、そちらにはファイル名の列そのものがありません。Bun に用意されていた手段は、ビルド変数 `BUN_VERSION` だけでした。

リポジトリ側から Bun を指定したいという要望は [Cloudflare Community](https://community.cloudflare.com/t/support-bun-version-for-build-images/849333) に出ていますが、この記事を書いている時点で `.bun-version` は未対応です。`package.json` の `packageManager` フィールドを Workers Builds が読むかどうかは、ドキュメントに記載がなく、私も試していません。

このリポジトリでは `mise.toml` に Bun のバージョンを書いて固定していますが、Cloudflare のビルド環境はこのファイルを見ません。ビルド環境を 1.4 系にするには `BUN_VERSION` を使うしかない、ということになります。そしてその `BUN_VERSION` は、ダッシュボードから設定済みでした。`main` のビルドが `bun@1.4.0` で動いていたのも、この値が届いていたからです。それでも非本番ブランチだけは 1.2.15 のままでした。

## ビルド変数が保存される単位

[Workers Builds API reference](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/) に、次のように書かれています。

> Each Worker has up to two triggers: one for production (runs on your production branch) and one for preview (runs on all other branches).

Workers Builds がビルド設定を持つ単位は「トリガー」です。1 つの Worker につきトリガーは最大 2 つあり、本番ブランチを対象にするものと、それ以外のすべてのブランチを対象にするものに分かれます。

分かれているのはブランチの条件だけではありません。ビルドコマンド、デプロイコマンド、そしてビルド変数も、トリガーごとに独立して持ちます。同じドキュメントの `environment_variables` の説明はこうです。

> `environment_variables` — Build-time variables specific to this trigger

ビルド変数が紐づく先は、Worker ではなくトリガーでした。一方、ダッシュボードの「変数とシークレット」の欄は 1 つしかありません。ビルド設定のページに 1 つだけ置かれた欄を見て、私はそこに入れた値がこの Worker のビルド全体に届くものだと思っていました。実際に保存されていたのは、本番トリガーの分だけです。

REST API で 2 つのトリガーを取得して並べると、こうなっていました。

| トリガー | `branch_includes` | `branch_excludes` | ビルド変数 |
|---|---|---|---|
| 本番 | `["main"]` | `[]` | `BUN_VERSION: 1.4.0` |
| プレビュー | `["*"]` | `["main"]` | なし |

プレビュートリガーには何も入っていません。ここが空だと、ビルド環境の Bun は既定の 1.2.15 になります。`main` へのマージが成功し続け、非本番ブランチだけが止まっていた理由がこれです。

ロックファイルの形式が 1 だった間は、Bun 1.2.15 でも読めていました。プレビュートリガーが空のままでもビルドは成功していたので、この食い違いには気づきませんでした。

ダッシュボードには、プレビュートリガーの変数を表示する場所も、編集する場所もありません。設定されているかどうかを画面から確かめられず、ビルドログの `Detected the following tools from environment:` の行を見て初めて分かる状態でした。

## プレビュートリガーに `BUN_VERSION` を設定する

ダッシュボードから操作できないので、REST API を使います。

まず、「Workers Builds Configuration: 編集」の権限を付けた API トークンを作ります。Worker のタグを API で調べるなら「Workers Scripts: 読み取り」も必要です。[Builds API reference](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/) にあるとおり、この API が受け付けるのはユーザー単位のトークンだけで、アカウント単位のトークンには `Invalid token` が返ります。

<!-- textlint-disable preset-ja-technical-writing/no-unmatched-pair -->

>[!IMPORTANT]
>`wrangler login` で作られる OAuth トークンでは、Workers Builds の API は使えません。`wrangler whoami` が使うトークンでトリガー一覧を取得すると `{"code": 10000, "message": "Authentication error"}` が返ります。ダッシュボードの「API トークン」から別に作る必要があります。

<!-- textlint-enable preset-ja-technical-writing/no-unmatched-pair -->

デプロイ用に既に持っているトークンがあっても、Workers Builds 構成の権限が付いていなければ同じエラーになります。私も専用のトークンを作り、設定を終えてから削除しました。

トークンとアカウント ID を環境変数に入れ、Worker のタグを取得します。`my-worker` の部分は自分の Worker 名に置き換えてください。

```bash
export CF_API_TOKEN='<作成したトークン>'
export CF_ACCOUNT_ID='<アカウント ID>'

TAG=$(curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/scripts" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  | jq -r '.result[] | select(.id=="my-worker") | .tag')
```

このタグを使って、トリガーの一覧を取得します。

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/builds/workers/$TAG/triggers" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  | jq '.result[] | {trigger_uuid, trigger_name, branch_includes, branch_excludes, build_command, deploy_command}'
```

`branch_includes` が `["*"]` で `branch_excludes` が `["main"]` になっているほうがプレビュートリガーです。その `trigger_uuid` を控えます。

この一覧の応答には、設定済みのビルド変数が含まれません。値を読むには、トリガーごとの別のエンドポイントを呼びます。

```bash
export PREVIEW_UUID='<プレビュートリガーの UUID>'

curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/builds/triggers/$PREVIEW_UUID/environment_variables" \
  -H "Authorization: Bearer $CF_API_TOKEN"
```

私の場合、プレビュートリガーが返したのは `{"result":{},"success":true,...}` です。本番トリガーの UUID で同じことをすると、`BUN_VERSION` が入っていました。この 2 つを並べれば、ダッシュボードで保存した値が片方にしか届いていないと分かります。

設定は同じエンドポイントへの `PATCH` です。

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/builds/triggers/$PREVIEW_UUID/environment_variables" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X PATCH \
  --data '{"BUN_VERSION":{"value":"1.4.0","is_secret":false}}'
```

`"success": true` と、設定した変数の `created_on` が返ってきます。

## 設定後のビルド

空のコミットを作った検証用ブランチを push して、ビルドを実行しました。

```
Detected the following tools from environment: bun@1.4.0, nodejs@24.18.0
Installing bun 1.4.0
Installing project dependencies: bun install --frozen-lockfile
bun install v1.4.0 (34cbb9a40)
...
Success: Deploy command completed
✨ Success! Build completed.
```

1 行目が `bun@1.4.0` に変わり、`Installing bun 1.4.0` の行が増えました。既定と違うバージョンを指定したため、ビルド環境が Bun を入れ直しています。依存関係のインストールを抜け、プレビュー版のアップロードまで到達しました。所要時間は 70 秒です。

Workers Builds は、ビルド 1 件ごとの記録にその時点のビルド変数を保存します。修正の前後を並べると、変わったのは変数だけです。

| ブランチ | 結果 | 記録された変数 | 検出された Bun |
|---|---|---|---|
| 修正前の非本番ブランチ | fail | `{}` | 1.2.15 |
| 修正後の非本番ブランチ | success | `BUN_VERSION: 1.4.0` | 1.4.0 |

## まとめ

- Bun 1.4.0 から `bun.lock` の `lockfileVersion` が 1 から 2 に上がる。1.3 系の最終版である 1.3.14 はまだ 1 を書く
- 形式 2 のロックファイルを古い Bun で読ませると `Unknown lockfile version` で止まる。`bunx bun@1.2.15 install --frozen-lockfile` で手元でも再現できる
- Cloudflare Workers Builds のビルドイメージには、Bun 1.2.15 が既定で入る。ドキュメントの表に Bun のバージョン指定ファイルの記載はなく、ビルド変数 `BUN_VERSION` で指定する
- Workers Builds のビルド設定は、本番用とプレビュー用の 2 つのトリガーに分かれて保存される。ビルド変数もトリガーごとに独立している
- ダッシュボードの「変数とシークレット」で保存した値は、本番トリガーにしか入らない。プレビュートリガーの変数は画面に表示されず、REST API でしか読み書きできない
- プレビュートリガーに `BUN_VERSION` が届いているかは、ビルドログの `Detected the following tools from environment:` に出る Bun のバージョンで判断できる

## 参考

- [Build image · Cloudflare Workers docs](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Build configuration · Cloudflare Workers docs](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Workers Builds API reference · Cloudflare Workers docs](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)
- [`BunLockFile.lockfileVersion` · Bun reference](https://bun.com/reference/bun/BunLockFile/lockfileVersion)
- [List of breaking changes for 1.4 · oven-sh/bun #28792](https://github.com/oven-sh/bun/issues/28792)
- [Bun lockfile version: 2 (Bun 1.4.0/canary) · vercel/turborepo Discussion #13126](https://github.com/vercel/turborepo/discussions/13126)
- [Support .bun-version for build images · Cloudflare Community](https://community.cloudflare.com/t/support-bun-version-for-build-images/849333)
