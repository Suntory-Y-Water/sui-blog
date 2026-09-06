import emojiData from 'unicode-emoji-json';

/**
 * 絵文字の情報を表す型
 *
 * unicode-emoji-jsonパッケージが提供する絵文字メタデータの構造を定義します。
 */
type Emoji = {
  /** 絵文字の名前(例: "fire", "smiling face with halo") */
  name: string;
  /** 絵文字のslug(例: "fire", "smiling_face_with_halo") */
  slug: string;
  /** 絵文字のグループ(例: "Smileys & Emotion") */
  group: string;
  /** 絵文字が追加されたEmoji仕様バージョン */
  emoji_version: string;
  /** Unicodeバージョン */
  unicode_version: string;
  /** 肌色のバリエーションをサポートするかどうか */
  skin_tone_support: boolean;
};

/**
 * FluentUI Emojiの生成パラメータ
 */
type FluentEmojiParams = {
  /** 絵文字情報 */
  emojiInfo: Emoji;
  /** unicode-emoji-json のルックアップに使用した絵文字文字 */
  emoji: string;
};

/**
 * unicode-emoji-json から絵文字情報を検索する
 *
 * 入力絵文字の U+FE0F (Variation Selector-16) の有無にかかわらずデータを取得できるよう、
 * 以下の順で検索する:
 * 1. 入力そのまま
 * 2. U+FE0F をすべて除去
 * 3. U+FE0F をすべて除去した上で末尾に U+FE0F を付与
 *    (Mac からの ZWJ シーケンス入力で FE0F が欠落するケースに対応)
 *
 * @returns emojiInfo と実際にヒットした emoji 文字のペア、または見つからない場合は null
 */
function lookupEmojiInfo(
  icon: string,
): { emojiInfo: Emoji; emoji: string } | null {
  const data = emojiData as Record<string, Emoji>;

  const withoutFE0F = icon.replace(/\uFE0F/g, '');
  const withFE0F = `${withoutFE0F}\uFE0F`;

  for (const candidate of [icon, withoutFE0F, withFE0F]) {
    const info = data[candidate];
    if (info) {
      return { emojiInfo: info, emoji: candidate };
    }
  }

  return null;
}

/**
 * コードポイント文字列から U+FE0F を除いて正規化する
 *
 * FluentUI metadata の unicode フィールドと入力絵文字のコードポイントで
 * FE0F の有無が異なる場合があるため、比較前に両側を正規化する。
 */
function normalizeCodepoints(codepoints: string): string {
  return codepoints
    .split(' ')
    .filter((cp) => cp.toLowerCase() !== 'fe0f')
    .join(' ');
}

const BASE_PATH =
  'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets';

/**
 * 人を表す先頭の語
 *
 * CLDR 名と FluentUI のディレクトリ名は、この位置の語だけが食い違うことがある。
 * (例: 👯 の CLDR 名は "people with bunny ears" だがディレクトリは "Person with bunny ears")
 */
const PERSON_WORDS = new Set([
  'people',
  'person',
  'man',
  'woman',
  'men',
  'women',
]);

/**
 * パスの各要素をURLエンコードする(ディレクトリ名の空白を%20にする)
 */
function encodePath(assetPath: string): string {
  return assetPath.split('/').map(encodeURIComponent).join('/');
}

/**
 * 絵文字からFluentUI EmojiのURLを生成する
 *
 * Microsoft FluentUI Emojiのアセットは、GitHubのCDNでホストされています。
 * この関数は絵文字のメタデータからアセットのURLを生成します。
 *
 * まず名前変換による単純なURL生成を試み、404の場合はGitHub APIで
 * 正しいディレクトリを検索するフォールバックを実行します。
 *
 * @param params - FluentUI Emojiの生成パラメータ
 * @returns FluentUI EmojiのURL、または見つからない場合はnull
 */
async function generateFluentEmojiUrl({
  emojiInfo,
  emoji,
}: FluentEmojiParams): Promise<string | null> {
  const { name, slug, skin_tone_support } = emojiInfo;

  // ディレクトリ名: nameを最初の文字だけ大文字にして、残りは小文字
  // 例: "woman gesturing OK" → "Woman gesturing ok"
  const dirName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

  // unicode-emoji-json が肌の色に対応していると言っていても、FluentUI 側に
  // Default/Flat が用意されていないことがある(👯 は Flat だけ)。両方試す。
  const skinToneVariant = {
    flatPath: 'Default/Flat',
    fileName: `${slug}_flat_default.svg`,
  };
  const plainVariant = { flatPath: 'Flat', fileName: `${slug}_flat.svg` };
  const variants = skin_tone_support
    ? [skinToneVariant, plainVariant]
    : [plainVariant, skinToneVariant];

  for (const { flatPath, fileName } of variants) {
    const url = `${BASE_PATH}/${encodePath(`${dirName}/${flatPath}/${fileName}`)}`;
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        return url;
      }
    } catch {
      // fetch失敗時は次の候補、最後はフォールバックへ
    }
  }

  // フォールバック: GitHub APIでunicodeコードポイントから正しいディレクトリを検索
  return await searchFluentEmojiUrl({ emoji, name });
}

/**
 * CLDR 名から FluentUI のディレクトリ候補を絞り込む
 *
 * ディレクトリ名は CLDR 名と一致しないことがある。
 * (例: 🧙 の CLDR 名は "mage" だがディレクトリは "Person mage"、
 * 👯 の CLDR 名は "people with bunny ears" だがディレクトリは "Person with bunny ears")
 * 名前を含むディレクトリに加えて、人を表す先頭の語を落とした残りの語を
 * すべて含むディレクトリも候補に入れる。
 */
function collectCandidateDirs({
  name,
  allDirNames,
}: {
  name: string;
  allDirNames: string[];
}): string[] {
  const lowerName = name.toLowerCase();
  const byName = allDirNames.filter((dirName) =>
    dirName.toLowerCase().includes(lowerName),
  );

  const words = lowerName.split(' ');
  const rest = PERSON_WORDS.has(words[0] ?? '') ? words.slice(1) : [];
  const byRest =
    rest.length === 0
      ? []
      : allDirNames.filter((dirName) => {
          const lowerDirName = dirName.toLowerCase();
          return rest.every((word) => lowerDirName.includes(word));
        });

  return [...new Set([...byName, ...byRest])];
}

/**
 * ディレクトリ配下のFlatなSVGのパスを選ぶ
 *
 * 肌の色に対応したディレクトリは Default/Flat、そうでなければ Flat に入る。
 * Dark/Flat などの肌の色つきは既定の見た目と異なるため選ばない。
 */
function pickFlatSvgPath({
  dirName,
  treePaths,
}: {
  dirName: string;
  treePaths: string[];
}): string | undefined {
  const prefix = `assets/${dirName}/`;
  const svgPaths = treePaths.filter(
    (treePath) => treePath.startsWith(prefix) && treePath.endsWith('.svg'),
  );

  return (
    svgPaths.find((treePath) =>
      treePath.startsWith(`${prefix}Default/Flat/`),
    ) ?? svgPaths.find((treePath) => treePath.startsWith(`${prefix}Flat/`))
  );
}

/**
 * GitHub Git Trees APIを使ってFluentUI Emojiの正しいURLを検索する
 *
 * FluentUI EmojiリポジトリのディレクトリはCLDR名と異なる場合がある。
 * (例: 🧙 のCLDR名は "mage" だが、ディレクトリは "Person mage")
 * contents APIは1000件上限があるためGit Trees APIを使用し、
 * unicodeコードポイントでmetadata.jsonを照合して正しいパスを特定する。
 *
 * @returns FluentUI EmojiのURL、または見つからない場合はnull
 */
async function searchFluentEmojiUrl({
  emoji,
  name,
}: {
  emoji: string;
  name: string;
}): Promise<string | null> {
  // 絵文字からunicodeコードポイントを計算 (例: "1f9d9 200d 2640")
  // FE0F は比較時に無視するため、ここでは除去した形で保持する
  const codepoints = normalizeCodepoints(
    [...emoji].map((c) => (c.codePointAt(0) ?? 0).toString(16)).join(' '),
  );

  // Git Trees API でリポジトリ全体のツリーを取得 (contents APIは1000件上限あり)
  const treeUrl =
    'https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/main?recursive=1';
  let treePaths: string[];
  let allDirNames: string[];
  try {
    const res = await fetch(treeUrl, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as {
      truncated: boolean;
      tree: Array<{ path: string; type: string }>;
    };
    treePaths = data.tree
      .filter((item) => item.type === 'blob')
      .map((item) => item.path);
    // assets直下のディレクトリ名のみ抽出
    allDirNames = data.tree
      .filter(
        (item) => item.type === 'tree' && /^assets\/[^/]+$/.test(item.path),
      )
      .map((item) => item.path.replace('assets/', ''));
  } catch {
    return null;
  }

  const candidates = collectCandidateDirs({ name, allDirNames });

  for (const dirName of candidates) {
    try {
      const metaUrl = `${BASE_PATH}/${encodePath(`${dirName}/metadata.json`)}`;
      const metaRes = await fetch(metaUrl);
      if (!metaRes.ok) {
        continue;
      }
      const meta = (await metaRes.json()) as { unicode?: string };

      // FE0F を除いて比較 (入力とFluentUI metadataで FE0F の有無が異なる場合があるため)
      if (normalizeCodepoints(meta.unicode ?? '') !== codepoints) {
        continue;
      }

      const svgPath = pickFlatSvgPath({ dirName, treePaths });
      if (!svgPath) {
        continue;
      }

      return `https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/${encodePath(svgPath)}`;
    } catch {
      // 個別のディレクトリ取得失敗は無視して次の候補へ
    }
  }

  return null;
}

/**
 * 絵文字をFluentUI EmojiのURLに変換する
 *
 * この関数は絵文字文字列を受け取り、対応するFluentUI EmojiのURLを返します。
 * 絵文字データが見つからない場合や、変換できない場合は元の文字列をそのまま返します。
 *
 * @param icon - 変換する絵文字文字列(例: "🔥", "😎")
 * @returns FluentUI EmojiのURL、または変換できない場合は元の文字列
 */
export async function convertEmojiToFluentUrl({
  icon,
}: {
  icon: string;
}): Promise<string> {
  const result = lookupEmojiInfo(icon);

  // 絵文字データが見つからない場合は元の文字列を返す
  if (!result) {
    return icon;
  }

  const { emojiInfo, emoji } = result;

  // FluentUI EmojiのURLを生成(見つからない場合はnull)
  const url = await generateFluentEmojiUrl({ emojiInfo, emoji });

  // URLが取得できなかった場合は元の文字列を返す(呼び出し側でスキップ扱いになる)
  return url ?? icon;
}
