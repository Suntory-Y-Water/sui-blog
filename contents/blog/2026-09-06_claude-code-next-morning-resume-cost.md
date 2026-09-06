---
title: Claude Code で翌朝の「さっきの続きやって」が一番高いのか確かめた
slug: claude-code-next-morning-resume-cost
date: 2026-09-06
modified_time: 2026-09-06
description: Claude Code の利用状況を Cloudflare D1 にためています。3 か月半で 38,500 件たまったので、「1 時間以上あけて同じセッションに戻る最初の入力が一番高い」という話が自分のデータでも成り立つのかを確かめました。60 分を境に何が変わるのか、何が金額を決めているのか、対策として書いたフックを扱います。
icon: 📈
icon_url: /icons/chart_increasing_flat.svg
tags:
  - ClaudeCode
  - OpenTelemetry
  - Cloudflare
---

Claude Code の利用状況を OpenTelemetry で [Cloudflare D1 にためています](/blog/claude-code-usage-otel-cloudflare-d1)。ためはじめて 3 か月半、リクエスト 1 件ずつの記録が 38,500 件たまってきました。

そこで odacchi 氏の [Claude Codeのプロンプトキャッシュ TTL](https://zenn.dev/odacchi/articles/claude-code-prompt-cache-ttl)を読みました。プロンプトキャッシュには有効期間があり、それを過ぎて同じセッションに戻ると、会話履歴の全体を送り直すことになる、という話です。

この記事では、たまった記録でその話を確かめた結果と、結果を受けて作った対策を書きます。

## 記録している値

Claude Code は API へのリクエスト 1 件ごとに、キャッシュから読めたトークン数と、キャッシュに新しく書いたトークン数を分けて報告します。私が D1 に保存しているのは、この 2 つを含むリクエスト 1 件ぶんの記録です。1 行にはほかに、セッションの ID、時刻、モデル名も入れました。

セッションは `/clear` するまで 1 つの ID で続くので、同じセッション ID の行を時刻順に並べれば、前のやり取りからどれだけ間があいたかが分かります。

キャッシュが生きていれば、前回までの会話はそのまま読めるので、読めたトークン数のほうが大きくなります。有効期間が切れていれば、同じ内容をもう一度送って書き直すことになるので、大きくなるのは書いたトークン数のほうです。この 2 つの大小で、その 1 回がキャッシュに当たったかどうかを判定しました。

以下の数値は、2026 年 5 月 18 日から 9 月 6 日までにたまった 38,500 件、741 セッションぶんです。Claude Code は 2.1.263、`settings.json` の `promptCacheTtl` と `subagentPromptCacheTtl` はどちらも `1h` にしています。集めているのは自分で作った仕組みなので、同じ集計を読者がそのまま実行することはできません。

## 60 分を境にした変化

前回のリクエストからどれだけ間があいたかで、38,500 件をまとめました。

| 前回からの間隔 | 件数 | 読めた分（平均） | 書いた分（平均） | 1 件あたりのコスト比 |
|---|---:|---:|---:|---:|
| セッションの最初 | 741 | 4,594 | 4,350 | 0.74 |
| 1 分未満 | 34,988 | 69,861 | 2,131 | 1.00 |
| 1〜5 分 | 2,272 | 81,095 | 3,942 | 2.21 |
| 5〜30 分 | 312 | 87,967 | 10,957 | 3.14 |
| 30〜60 分 | 54 | 82,689 | 14,911 | 4.33 |
| 60〜120 分 | 40 | 27,424 | 66,838 | 11.79 |
| 2 時間超 | 89 | 17,566 | 69,417 | 11.48 |

コスト比は、1 分未満のリクエスト 1 件あたりを 1.00 としたときの倍率です。

30〜60 分までは読めた分のほうが大きく、60 分を超えると書いた分のほうが大きくなります。境目の位置を見るために、この付近を 5 分刻みにしました。

| 前回からの間隔 | 件数 | 読めた分（平均） | 書いた分（平均） |
|---|---:|---:|---:|
| 50〜55 分 | 7 | 98,475 | 4,204 |
| 55〜60 分 | 9 | 67,193 | 5,570 |
| 60〜65 分 | 6 | 10,601 | 97,572 |
| 65〜70 分 | 3 | 9,476 | 99,903 |

55〜60 分では、9 件のうち書き直しになったのは 2 件です。60〜65 分では、6 件のうち 5 件が書き直しでした。設定した 1 時間と同じ位置で入れ替わっています。

ただし、この付近の件数は多くありません。1 時間以上あけて同じセッションに戻ること自体が、そもそもあまり起きないからです。

## 有効期間が切れたあとの 1 回が占める割合

間隔が 60 分以上のリクエストは 129 件で、全体の 0.335% です。件数はこれだけですが、期間の総コストの 3.45% を占めます。キャッシュに書いたトークン数で見ると 8.87% です。

1 件あたりで比べると、間隔が 60 分未満でセッションの最初でもないリクエスト、つまりキャッシュが生きていたリクエストの **10.57 倍** でした。

129 件のうち 74 件、57.4% は、そのセッションの中で最もコストの高いリクエストです。作業を止めて戻ってきた最初の 1 回が、そのセッションの一番高い 1 回になっています。

## 書き直される量を決めているもの

間隔が 60 分以上のリクエストを、書いたトークン数の大きい順に 8 件見ました。どの 1 件も、直前のやり取りまでに積み上がっていた量の 9 割から 10 割を書き直しています。会話履歴をほぼ丸ごと送り直していることになります。

最も大きかったのは、9 時間あけたあとの 328,307 トークンです。間隔が 61.9 分の 1 件でも 293,769 トークンを書き直していて、キャッシュから読めた分は 0 でした。8 件ともモデルは `claude-opus-5` です。

では放置時間が長いほど高くなるのかというと、そうではありません。

| 放置時間 | 件数 | 書いた分（平均） | 書いた分（最大） |
|---|---:|---:|---:|
| 60〜90 分 | 25 | 76,563 | 293,769 |
| 90〜180 分 | 24 | 65,309 | 216,442 |
| 3〜12 時間 | 56 | 72,974 | 328,307 |
| 12 時間超 | 24 | 53,483 | 177,331 |

平均が最も大きいのは 60〜90 分で、最も小さいのは 12 時間超です。有効期間が切れた時点で読めるものは無くなるので、そこから先どれだけ待っても送り直す量は変わりません。

金額を決めているのは、そのセッションにたまった会話履歴の量です。翌朝の 1 回が高くつくのは、翌朝だからではなく、前の晩に長く続けたからです。同じ 1 時間の中断でも、始めたばかりのセッションなら、送り直す量は数千トークンにとどまると考えられます。

## 1 時間あいた入力を止めるフック

対策は、有効期間が切れる前に `/clear` して、新しいセッションを始めることです。ただし、翌朝に開いたセッションが昨夜の続きなのかは、画面を見ただけでは分かりません。判定はフックにやらせます。

Claude Code の [`SessionStart` フック](https://code.claude.com/docs/en/hooks)は、`--resume` や fork で再開したときに限り、前回の応答からの経過秒数と、キャッシュが切れている見込みを渡してきます。ところが今回止めたいのは、セッションを開いたまま翌朝そのまま入力する場合です。このときはセッションが前の晩に始まったままなので、`SessionStart` が発火しません。経過時間は自分で測る必要があります。

使うイベントは 3 つです。`Stop` で応答が終わった時刻をファイルに書き、`UserPromptSubmit` でその時刻からの経過を測り、`SessionStart` で記録を消します。

```ts:~/.claude/scripts/typescript/cache-ttl-guard.ts
#!/usr/bin/env -S bun run --silent
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { defineHook, runHook } from 'cc-hooks-ts';
import { join } from 'pathe';

const STATE_DIR = join(homedir(), '.claude', 'cache-ttl');
const HOUR_MS = 60 * 60 * 1000;
// promptCacheTtl が 1h なので、これを超えた入力は履歴全体の書き直しになる
const THRESHOLD_MS = HOUR_MS;
// cleanupPeriodDays の対象外なので自前で消す
const RETENTION_MS = 7 * 24 * HOUR_MS;

interface State {
  endedAt: number;
  blockedHash?: string;
}

function stateFile(sessionId: string): string | undefined {
  if (!/^[\w-]+$/.test(sessionId)) {
    return undefined;
  }
  return join(STATE_DIR, `${sessionId}.json`);
}

function readState(path: string): State | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as State).endedAt !== 'number'
  ) {
    return undefined;
  }
  return parsed as State;
}

function writeState(path: string, state: State): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(state), 'utf-8');
}

function removeExpired(): void {
  if (!existsSync(STATE_DIR)) {
    return;
  }
  const limit = Date.now() - RETENTION_MS;
  for (const name of readdirSync(STATE_DIR)) {
    const path = join(STATE_DIR, name);
    if (statSync(path).mtimeMs < limit) {
      rmSync(path, { force: true });
    }
  }
}

function hashOf(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex');
}

const hook = defineHook({
  trigger: {
    SessionStart: true,
    Stop: true,
    UserPromptSubmit: true,
  },

  run: (context) => {
    try {
      const path = stateFile(context.input.session_id);
      if (path === undefined) {
        return context.success({});
      }

      // /compact はセッション ID を引き継ぐ。記録を消さないと、
      // キャッシュを作り直した直後の入力を止めてしまう
      if (context.input.hook_event_name === 'SessionStart') {
        if (
          context.input.source === 'clear' ||
          context.input.source === 'compact'
        ) {
          rmSync(path, { force: true });
        }
        return context.success({});
      }

      if (context.input.hook_event_name === 'Stop') {
        if (context.input.stop_hook_active) {
          return context.success({});
        }
        writeState(path, { endedAt: Date.now() });
        removeExpired();
        return context.success({});
      }

      const state = readState(path);
      if (state === undefined) {
        return context.success({});
      }

      const elapsed = Date.now() - state.endedAt;
      if (elapsed < THRESHOLD_MS) {
        return context.success({});
      }

      // 同じ内容の 2 回目はそのまま処理させる。毎回止めると作業が進まない
      const hash = hashOf(context.input.prompt);
      if (state.blockedHash === hash) {
        return context.success({});
      }

      writeState(path, { endedAt: state.endedAt, blockedHash: hash });
      const hours = Math.floor(elapsed / HOUR_MS);
      return context.blockingError(
        [
          `前回のやり取りから ${hours} 時間経過しています。/clear してください。`,
          'このまま続ける場合は、同じ内容をもう一度送信してください。',
        ].join('\n'),
      );
    } catch (err) {
      process.stderr.write(
        `[cache-ttl-guard] ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return context.success({});
    }
  },
});

if (import.meta.main) {
  await runHook(hook);
}
```

標準入力の JSON を読む処理と、`context.blockingError()` を終了コード 2 に変換する処理は [cc-hooks-ts](https://www.npmjs.com/package/cc-hooks-ts)の中にあります。終了コード 2 は、Claude Code がその入力を処理せず、標準エラーに書いた内容を画面へ出す合図です。

```bash
bun add -d cc-hooks-ts@^2.1.251 pathe@^2.0.3
```

コードだけでは分かりにくい判断が 3 つあるので、補足します。

`Stop` で `stop_hook_active` が `true` のときは何もしません。これはフックが原因で Claude Code が応答を続けている状態です。ここで時刻を書くと、本当に応答が終わった時刻を上書きしてしまいます。

`SessionStart` の `source` が `clear` か `compact` のときは記録を消します。`/compact` はセッションの ID をそのまま引き継ぐため、要約でキャッシュを作り直した直後なのに古い終了時刻が残り、次の入力を止めてしまうからです。

一度止めた入力と同じ内容が続けて送られてきたら、2 回目はそのまま処理させます。毎回止めると作業が進みません。続けるかどうかは自分で決めたいので、フックが止めるのは 1 回だけにしています。

`settings.json` には 3 つのイベントすべてに同じスクリプトを登録します。時刻を書く、読む、消すという役目を分けているので、3 つそろわないと動きません。

```json:~/.claude/settings.json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "bun run -i --silent ~/.claude/scripts/typescript/cache-ttl-guard.ts"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run -i --silent ~/.claude/scripts/typescript/cache-ttl-guard.ts"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run -i --silent ~/.claude/scripts/typescript/cache-ttl-guard.ts"
          }
        ]
      }
    ]
  }
}
```

止められたあとに選ぶのは `/compact` ではなく `/clear` です。[公式ドキュメント](https://code.claude.com/docs/en/prompt-caching)は `/compact` の要約リクエストについて「After a break longer than the cache lifetime, there is no cache left to read, so the summarization request reprocesses the full history as uncached input」と書いています。有効期間が切れたあとの `/compact` が処理し直すのは、履歴の全体です。

1 つ気になっている点があります。公式ドキュメントによれば、`UserPromptSubmit` で終了コード 2 を返すと入力欄の内容が消えます。長い入力を書いたあとに止められると打ち直しになるので、メッセージには「同じ内容をもう一度送信してください」と書きました。対話セッションで実際に消えるかどうかは、まだ確かめていません。

## 動かして確かめたところ

60 分以上あけたセッションに入力を送ると、フックがその場で止めます。次の画面で見てほしいのは、入力が処理に進まず、フックのメッセージが表示されて止まっていることです。

<!-- TODO(media): スクリーンショット を入れる。60 分以上あけたセッションに入力して止められた状態 を写す。読者が観測するのは フックのメッセージが表示され、入力が処理されずに止まっていること。代替テキスト: 前回のやり取りから 1 時間経過していることを知らせ、/clear を促すフックのメッセージ -->

画面とは別に、スクリプト単体の動作も確かめてあります。終了時刻の記録を 95 分前に書き換えたうえで、フックのイベントを表す JSON を標準入力から渡し、終了コードを見ました。

| 操作 | 期待 | 結果 |
|---|---|---|
| 60 分超で `UserPromptSubmit` | 終了コード 2、標準エラーにメッセージ | 終了コード 2。メッセージの出力を確認 |
| 同じ内容をもう一度 `UserPromptSubmit` | 終了コード 0 で処理を続ける | 終了コード 0 |
| 違う内容で `UserPromptSubmit` | 終了コード 2 で再び止める | 終了コード 2 |
| `SessionStart` の `source` が `compact` | 記録を削除する | 削除を確認 |

標準エラーに出たのはこの 2 行です。

```text
前回のやり取りから 1 時間経過しています。/clear してください。
このまま続ける場合は、同じ内容をもう一度送信してください。
```

## まとめ

- 私の環境では、プロンプトキャッシュが切れる位置は 60 分だった。55〜60 分では 9 件中 2 件だけが書き直しで、60〜65 分では 6 件中 5 件が書き直しになる
- 切れたあとの最初の 1 回は、キャッシュが生きていたリクエストの 10.57 倍のコストだった。件数は全体の 0.335% だが、総コストの 3.45% を占める
- そのとき送り直しているのは会話履歴のほぼ全体で、直前までに積み上がっていた量の 9 割から 10 割にあたる
- 放置時間が長くなっても送り直す量は増えない。金額を決めているのは、そのセッションにたまった履歴の量である
- セッションを開いたまま翌朝そのまま入力する場合、`SessionStart` は発火しない。経過時間は `Stop` フックで自分で記録する
- `UserPromptSubmit` で終了コード 2 を返せば入力を止められる。ただし公式ドキュメントによれば、入力欄の内容は消える

## 参考

https://code.claude.com/docs/en/prompt-caching

https://code.claude.com/docs/en/hooks

https://zenn.dev/odacchi/articles/claude-code-prompt-cache-ttl

[Claude Code の利用状況を Cloudflare D1 にためてみる](/blog/claude-code-usage-otel-cloudflare-d1)
