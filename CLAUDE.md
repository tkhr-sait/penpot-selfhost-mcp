# Claude Code Project Instructions

## Language
- Respond in Japanese (日本語で応答すること)

## Penpot Skill
- penpot skill は Claude Code と GitHub Copilot の両方に対応している
- 問題解決や改善提案の際、MEMORY や Claude Code 特有の機能だけに頼らず、skill 配布・GitHub Copilot 互換性を考慮すること
- 問題解決の際、CLAUDE.md への追記は最終手段とし、スキル側（SKILL.md 等）での解決を優先すること

## Penpot MCP ツール使用ルール
- Penpot MCP ツール使用前に `/penpot` スキルをロードすること
- スキルの初期化で `activate` が呼ばれ、MCP が利用可能になる

## 批判的思考
- プラン提案時は、提出前に自己レビューを行い100点満点で採点すること
- 提案が根本原因に対処しているか、効果が発揮されるタイミングは正しいか（例: 情報が親AIに見えるのかサブエージェントにしか見えないのか）を検証する
- 70点未満の場合は修正してから提出する
