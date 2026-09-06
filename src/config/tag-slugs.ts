/**
 * タグ名→slug、slug→タグ名のマッピングテーブル
 *
 * ## ルール
 * - 画面表示: 日本語タグ(例: "アクセシビリティ")
 * - URL: 英語slug(例: "accessibility")
 * - slug: 小文字、ハイフン区切り、英数字のみ
 */

export const TAG_SLUG_MAP: Record<string, string> = {
  AgentsSkills: 'agents-skills',
  Anaconda: 'anaconda',
  Angular: 'angular',
  API: 'api',
  AI: 'ai',
  'agent-browser': 'agent-browser',
  AppRouter: 'app-router',
  Astro: 'astro',
  Biome: 'biome',
  BeautifulSoup: 'beautifulsoup',
  Bun: 'bun',
  'chart.js': 'chartjs',
  ChatGPT: 'chatgpt',
  ChromeExtension: 'chrome-extension',
  CI: 'ci',
  clasp: 'clasp',
  Claude: 'claude',
  ClaudeCode: 'claude-code',
  Cloudflare: 'cloudflare',
  CloudflareWorkers: 'cloudflare-workers',
  CMS: 'cms',
  CSS: 'css',
  CSV: 'csv',
  Decode: 'decode',
  dependabot: 'dependabot',
  Design: 'design',
  DevContainer: 'devcontainer',
  DI: 'di',
  Discord: 'discord',
  Django: 'django',
  Docker: 'docker',
  E2E: 'e2e',
  Eclipse: 'eclipse',
  Excel: 'excel',
  FastAPI: 'fastapi',
  Firebase: 'firebase',
  Flask: 'flask',
  GAS: 'gas',
  Grafana: 'grafana',
  GitHub: 'github',
  GitHubCopilot: 'github-copilot',
  GitHubActions: 'github-actions',
  GitHubAgenticWorkflows: 'github-agentic-workflows',
  GoogleAppScript: 'google-app-script',
  GoogleCloud: 'google-cloud',
  GoogleMapsAPI: 'google-maps-api',
  Hono: 'hono',
  HonoX: 'honox',
  HTML: 'html',
  InversifyJS: 'inversify-js',
  Java: 'java',
  JavaScript: 'javascript',
  Kubernetes: 'kubernetes',
  LineMessagingAPI: 'line-messaging-api',
  Markdown: 'markdown',
  Marp: 'marp',
  MCP: 'mcp',
  mecab: 'mecab',
  MySQL: 'mysql',
  'Next.js': 'nextjs',
  Notion: 'notion',
  NotionAPI: 'notion-api',
  Obsidian: 'obsidian',
  OGP: 'ogp',
  OSS: 'oss',
  OpenCV: 'opencv',
  OpenTelemetry: 'opentelemetry',
  'OpenNext.js': 'opennextjs',
  pandas: 'pandas',
  Pagefind: 'pagefind',
  Playwright: 'playwright',
  PokeAPI: 'pokeapi',
  Postman: 'postman',
  pnpm: 'pnpm',
  PostgreSQL: 'postgresql',
  PowerPoint: 'powerpoint',
  pyautogui: 'pyautogui',
  pytest: 'pytest',
  Python: 'python',
  React: 'react',
  Renovate: 'renovate',
  Recharts: 'recharts',
  Selenium: 'selenium',
  Serena: 'serena',
  SVG: 'svg',
  'shadcn/ui': 'shadcn-ui',
  sqlalchemy: 'sqlalchemy',
  TailwindCSS: 'tailwind-css',
  TypeScript: 'typescript',
  Vercel: 'vercel',
  VisualStudioCode: 'vscode',
  Vite: 'vite',
  Vitest: 'vitest',
  WebAPI: 'web-api',
  Wikipedia: 'wikipedia',
  Word2Vec: 'word2vec',
  アニメ: 'anime',
  アルゴリズム: 'algorithm',
  オブジェクト指向プログラミング: 'object-oriented-programming',
  画像認識: 'image-recognition',
  クリーンアーキテクチャ: 'clean-architecture',
  形態素解析: 'morphological-analysis',
  個人開発: 'personal-development',
  スクレイピング: 'scraping',
  線形計画法: 'linear-programming',
  セキュリティ: 'security',
  SOLID原則: 'solid-principles',
  資格: 'certification',
  自然言語処理: 'natural-language-processing',
  自動化: 'automation',
  初心者: 'beginner',
  睡眠: 'sleep',
  データベース: 'database',
  テスト: 'test',
  読書: 'reading',
  ブログ: 'blog',
  ヘルスケア: 'healthcare',
  ポエム: 'poem',
  ポケモン: 'pokemon',
  ポートフォリオ: 'portfolio',
  絵文字: 'emoji',
  雑記: 'miscellaneous',
  旅行: 'travel',
} as const;

/**
 * タグ名からslugを取得
 * マッピングテーブルに存在しない場合は自動slug化にフォールバック
 */
export function getTagSlug(tagName: string): string {
  const slug = TAG_SLUG_MAP[tagName];
  if (slug) {
    return slug;
  }

  // フォールバック: 自動slug化
  return slugifyTag(tagName);
}

/**
 * slugからタグ名を取得
 */
export function getTagNameFromSlug(slug: string): string | undefined {
  const entry = Object.entries(TAG_SLUG_MAP).find(([_, s]) => s === slug);
  return entry?.[0];
}

/**
 * タグ名を自動的にslug化する関数(フォールバック用)
 *
 * 変換例:
 * - "Visual Studio Code" → "visual-studio-code"
 * - "TypeScript" → "typescript"
 * - "Next.js" → "nextjs"
 *
 * 注意: 日本語はそのまま残るため、マッピングテーブルでの明示的な定義を推奨
 */
function slugifyTag(tag: string): string {
  return tag
    .toLowerCase() // 小文字化
    .normalize('NFKD') // Unicode正規化
    .replace(/[\u0300-\u036f]/g, '') // アクセント記号削除
    .replace(/[^a-z0-9\s-]/g, '') // 英数字とスペース、ハイフン以外を削除
    .trim() // 前後の空白削除
    .replace(/\s+/g, '-') // スペースをハイフンに
    .replace(/-+/g, '-'); // 連続ハイフンを1つに
}
