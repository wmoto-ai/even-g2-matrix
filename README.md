# Even G2 Matrix Rain

映画「The Matrix」風のデジタルレインを [Even G2](https://www.evenrealities.com/smart-glasses) スマートグラスに表示するアプリ。

HTMLプレビュー（Canvas描画）とG2グラス（画像転送）の2系統で動作する。

## セットアップ

```bash
pnpm install
```

## 起動方法

```bash
# devサーバー起動（ポート5174）
pnpm dev
# → http://localhost:5174/
```

## シミュレーターで確認

```bash
# 公式シミュレーターで起動（--glow でグロー効果ON）
pnpm sim

# または直接
npx @evenrealities/evenhub-simulator --glow http://localhost:5174/
```

ブラウザにアプリUI、別ウィンドウにG2ディスプレイシミュレーター（576x288, 4bitグレースケール）が開く。

操作手順:
1. **Connect Glasses** → Bridge接続
2. **Start Matrix** → Matrix rain再生開始

## アーキテクチャ

```
[HTMLプレビュー]       [G2グラス/シミュレーター]
Canvas描画              ImageContainerProperty x2
(大画面, 高FPS)         (200x200px, PNGバイト転送)
       ↑                       ↑
    previewState             g2State     ← 独立したMatrixState
       ↑                       ↑
    nextMatrixFrame()     nextMatrixFrame() × G2_TICKS_PER_FRAME
```

- **HTMLプレビュー**: Canvas + 文字ごとの色・グロー・明暗（先頭=白, トレイル=緑グラデーション）
- **G2グラス**: オフスクリーンCanvasでMatrix rainを描画 → PNG変換 → `updateImageRawData()` で画像転送
  - G2は4bitグレースケール（16段階の緑）に自動変換するため、輝度差が表現される
  - 画像コンテナ2つを縦並べ（各200x100px → 合計200x200px）で表示面積を最大化
  - BLE転送が低速なため、1フレームで複数ティック進めて体感速度を補正

## G2画像転送の制約と知見

| 項目 | 値・備考 |
|------|---------|
| 画像コンテナ最大サイズ | 200 x 100 px（SDK制限） |
| 表示面積の最大化 | コンテナ2つ縦並べで **200 x 200 px** |
| imageData形式 | **PNGファイルバイト列（`number[]`）** が動作確認済み。base64文字列は動作しない |
| isEventCapture | ImageContainerPropertyにはない → **TextContainerPropertyを併設**する必要あり |
| 更新頻度 | 順次実行（`await`必須）。BLE経由のため実効1-2 FPS |
| 全角カタカナ | テキストモードでは1文字が2列幅を消費（~13列）。画像モードなら制約なし |
| 半角カタカナ | G2のテキストレンダラーでは描画されない（空白になる） |

## ファイル構成

| ファイル | 役割 |
|---------|------|
| `index.html` | エントリーポイント |
| `src/main.ts` | UI・Canvas描画・G2画像転送・フレームループ |
| `src/matrix-rain.ts` | Matrix rainアルゴリズム（明暗追跡・文字変異） |
| `src/bridge.ts` | Even G2 Bridge初期化・Mock fallback |
| `src/log.ts` | イベントログ |
| `vite.config.ts` | Vite設定 |

## 実機接続

1. iPhone に Even App をインストール
2. G2 を iPhone に BLE ペアリング
3. Even App でWebアプリのURL（`http://<your-ip>:5174/`）を設定
4. G2で動作確認

## ライセンス

MIT
