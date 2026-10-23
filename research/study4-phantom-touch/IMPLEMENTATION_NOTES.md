# Study 4（PhantomTouch）実装メモ

- 実装日: 2026-10-24
- 設計書: `implementation-plan.md`（同フォルダ）
- 生成シーン: `Assets/_Experiment_/Scenes/PhantomTouch.unity`
- 生成手段: `Assets/_Experiment_/Editor/PhantomTouch/Study4SceneBuilder.cs`（メニュー `LUIDA > Study4 > Build PhantomTouch scene`）。LUIDA のエディタ API（シーンテンプレート、State Machine タブの生成処理、State-listening Item 生成、質問紙束縛、Data Collector、アバターラッパー生成）をそのまま呼び出しているので、生成物は LUIDA の各ウィンドウでそのまま編集できる。

## 1. 生成されたもの

| 種別 | パス | 内容 |
|---|---|---|
| シーン | `Assets/_Experiment_/Scenes/PhantomTouch.unity` | テンプレート由来の環境 + 下記すべて |
| ステート | `Assets/_Experiment_/Settings/StateList/PhantomTouch.asset` | Start(qID1) → DeviceCheck → Trial - Start → Trial - Touch → Trial - Report → Trial - VEQ1(qID2) → Trial - VEQ2(qID3) → Trial - Rest(1 s) → SocialPresence(qID4) → PersonalExperience(qID5) → Debrief(qID6) → End |
| 実験変数 | `Assets/_Experiment_/Settings/ExperimentVariables/PhantomTouch.js` | within: `block`=1,2 / `rep`=1,2（非ランダム）、between: `social`=with,without / `order`=daily_first,assigned_first、Trials Count 1 → 4 試行 |
| 質問紙フォーム | シーン内 `LUIDA-QuestionnaireByState/<State>/Questionnaire_p1` ×6 | qID 1–6（Web Console 側の登録順と一致させること） |
| Data Collector | `Assets/_Experiment_/Scripts/DataCollectors/PhantomTouch.js`（Code モード、設定は `Settings/DataCollectorConfig/PhantomTouch.asset`） | 1 行のフィールド一覧は設計書 §12 |
| State-listening Items | `Assets/_Experiment_/Scripts/StateManagement/PhantomTouch/*.js` と `StateListeners/*.asset` | `Instruction`, `NpcDirector`, `AvatarGate`, `DeviceCheck`, `ReportPanel`, `ExitPortal` |
| NPC | `Assets/_Experiment_/Prefabs/PhantomTouch/NPC.prefab`（シーンに配置済み） | YoungAvatar.vrm のラッパー + `Scripts/PhantomTouch/NpcController.js` + `Avatars/PhantomTouch/Generated/NPC_BoneMap.js`（目ボーン追加済み）+ `npc_done` を Global へ中継する GlobalLogic |
| ボタン | シーン内 `ReportPanelUI/RP_0..RP_10, RP_Done`, `AvatarGateUI/AG_Changed, AG_Yes, AG_No`, `DeviceCheckUI/DC_Force` | 各ボタンは Item + Interact Item Trigger（Specified Item → 親 SLI の Integer 状態）+ `Scripts/PhantomTouch/Study4Button.js`（ラベル・表示・ON/OFF） |
| その他 | `FloorMarker`（Quad）、`Materials/PhantomTouch/*.mat`、`ExitPortal` 配下に移した `WorldGateToLuidaBar`（End で表示） | |

レイアウトはスポーン地点 (0,0,-2) を原点、+Z を正面として配置している。NPC は実行時に参加者の頭位置から立ち位置を再計算するので、初期位置は仮。

## 2. ランタイムの流れ（要点）

1. `Start`: 同意質問紙（qID 1）。完了で遷移。
2. `DeviceCheck`: 頭を左右 25° 以上回す ＋ 両手を頭より上に 1 秒。60 秒経過で救済ボタンが出る。合格で行を保存して遷移。
3. `Trial - Start`（rep=1 のみ）: 参加者をマーカーへテレポート、NPC を正面に配置（`npc_setup`）、AvatarGate が着替え指示 → 骨格シグネチャで一致判定（1 秒安定）→「着替えました」→「はい/いいえ」→ 行保存 → 遷移。rep=2 では AvatarGate が即 `ToNextState()`。
4. `Trial - Touch`: NpcDirector が `npc_trial_start` を送信。NPC は prep(2 s, with 条件は注視＋会釈/手振り) → ready(1.2 s で手を胸前へ) → approach(2 cm/s で顔の 3 cm 手前まで) → hold(2 s) → retract。完了で `npc_done`（Item 信号 → GlobalLogic → Global 信号）→ NpcDirector が遷移。120 秒の安全タイムアウトあり。
5. `Trial - Report`: 0–10 → 操作チェック 1–7 → （評定≥1 のみ）感覚の種類（複数）→ 部位（複数）→ 行保存 → 遷移。
6. `Trial - VEQ1` / `VEQ2`: NpcDirector の On State Start が `block`/`rep` を見て、該当ブロックの 2 試行目以外は即 `ToNextState()`。該当時は質問紙（VEQ）の完了で遷移。
7. `SocialPresence` → `PersonalExperience` → `Debrief`（各質問紙）→ `End`: データを 1 回アップロードし、ゲートを表示。

## 3. 残作業・確認事項（優先順）

1. Web Console（手動）: 実験作成（定員 1、Allowed platforms = VR、Participant Avatar = HIDE）、質問紙 qID 1–6 を設計書 §11 の順に登録、実験 ID を `LUIDA > Configure experiment identifiers` に設定、ワールド ID 登録。
2. テスト（設計書 §16）: T2（透明アバター定数 `AG_T_ARM`/`AG_T_SHOULDER` の実測更新）、T3、T4（2 cm/s・停止位置・身長差）、T5、T6、T7（Custom Log 7 行・100 kB 未満）、T8、T10。
3. 文言・レイアウト調整: 指示文は `Instruction.asset` の Set text、パネル文言は `ReportPanel` の Legacy code 内定数 `RP_TYPES`/`RP_LOCS`、位置は `*UI` グループの Transform。
4. 既知の軽微な点: ボタンは Study4Button.js の `btn_cfg` を受け取るまで非表示。`$.worldItemReference` の送信は 10 回/秒の制限があるため ReportPanel は 1 フレーム 4 件ずつ送っている。

## 4. 再生成

`LUIDA > Study4 > Build PhantomTouch scene` を実行すると、PhantomTouch 用の生成物（シーン、Settings、Scripts/StateManagement/PhantomTouch、Avatars/PhantomTouch、Prefabs/PhantomTouch）を削除してから作り直す。手で加えた変更は失われるので、恒久的な変更は `Study4SceneBuilder.cs` 側に反映すること。
