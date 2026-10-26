# Study 4（PhantomTouch）実装メモ

- 実装日: 2026-10-24（2026-10-26 更新: 挨拶期間・NPC 表示制御・笑顔・鏡・単一 VEQ ステート）
- 設計書: `implementation-plan.md`（同フォルダ）
- 生成シーン: `Assets/_Experiment_/Scenes/PhantomTouch.unity`
- 生成手段: `Assets/_Experiment_/Editor/PhantomTouch/Study4SceneBuilder.cs`（メニュー `LUIDA > Study4 > Build PhantomTouch scene`）。LUIDA のエディタ API（シーンテンプレート、State Machine タブの生成処理、State-listening Item 生成、質問紙束縛、Data Collector、アバターラッパー生成）をそのまま呼び出しているので、生成物は LUIDA の各ウィンドウでそのまま編集できる。

## 1. 生成されたもの

| 種別 | パス | 内容 |
|---|---|---|
| シーン | `Assets/_Experiment_/Scenes/PhantomTouch.unity` | テンプレート由来の環境 + 下記すべて |
| ステート | `Assets/_Experiment_/Settings/StateList/PhantomTouch.asset` | Start(qID1) → DeviceCheck → Trial - Start → Trial - Greeting(15 s) → Trial - Touch → Trial - Report → Trial - VEQ(qID2) → Trial - Rest(1 s) → SocialPresence(qID3) → PersonalExperience(qID4) → Debrief(qID5) → End |
| 実験変数 | `Assets/_Experiment_/Settings/ExperimentVariables/PhantomTouch.js` | within: `block`=1,2 / `rep`=1,2（非ランダム）、between: `social`=with,without / `order`=daily_first,assigned_first、Trials Count 1 → 4 試行 |
| 質問紙フォーム | シーン内 `LUIDA-QuestionnaireByState/<State>/Questionnaire_p1` ×5 | qID 1–5（Web Console 側の登録順と一致させること）。各コンテナは初期状態で非アクティブ（ステート開始時にギミックが有効化） |
| Data Collector | `Assets/_Experiment_/Scripts/DataCollectors/PhantomTouch.js`（Code モード、設定は `Settings/DataCollectorConfig/PhantomTouch.asset`） | 1 行のフィールド一覧は設計書 §12 |
| State-listening Items | `Assets/_Experiment_/Scripts/StateManagement/PhantomTouch/*.js` と `StateListeners/*.asset` | `Instruction`, `NpcDirector`, `AvatarGate`, `DeviceCheck`, `ReportPanel`, `MirrorPanel`, `ExitPortal` |
| NPC | `Assets/_Experiment_/Prefabs/PhantomTouch/NPC.prefab`（シーンに配置済み） | YoungAvatar.vrm のラッパー（モデル子オブジェクト名 `Model`）+ `Scripts/PhantomTouch/NpcController.js` + `Avatars/PhantomTouch/Generated/NPC_BoneMap.js`（目ボーン追加済み）+ `npc_done` を Global へ中継する GlobalLogic + 顔メッシュ `Face` の Animator（`NpcFace.controller`、トリガー `smile` でブレンドシェイプ `Fcl_ALL_Fun` を再生する `NpcSmile.anim`） |
| ボタン | シーン内 `ReportPanelUI/RP_0..RP_10, RP_Done`, `AvatarGateUI/AG_Changed, AG_Yes, AG_No`, `DeviceCheckUI/DC_Force` | 各ボタンは Item + Interact Item Trigger（Specified Item → 親 SLI の Integer 状態）+ `Scripts/PhantomTouch/Study4Button.js`（ラベル・表示・ON/OFF） |
| 鏡 | `MirrorPanel`（SLI）配下に CCK の `Mirror.prefab`（1.3 × 2.0 m、初期非アクティブ） | NPC の斜め後ろ（参加者から見て左前方）。Trial - Greeting 開始で表示、Trial - Touch 終了で非表示 |
| その他 | `FloorMarker`（Quad）、`Materials/PhantomTouch/*.mat`、`ExitPortal` 配下に移した `WorldGateToLuidaBar`（End で表示） | |

レイアウトはスポーン地点 (0,0,-2) を原点、+Z を正面として配置している。NPC は実行時に参加者の頭位置から立ち位置を再計算するので、初期位置は仮。

## 2. ランタイムの流れ（要点）

1. `Start`: 同意質問紙（qID 1）。完了で遷移。NPC は非表示。
2. `DeviceCheck`: 頭を左右 25° 以上回す ＋ 両手を頭より上に 1 秒。60 秒経過で救済ボタンが出る。合格で行を保存して遷移。
3. `Trial - Start`（rep=1 のみ）: 参加者をマーカーへテレポート、NPC を非表示（`npc_hide`）にして AvatarGate が着替え指示 → 骨格シグネチャで一致判定（1 秒安定）→「着替えました」→「はい/いいえ」→ 行保存 → 遷移。rep=2 では AvatarGate が即 `ToNextState()`。
4. `Trial - Greeting`（15 秒、rep=1 のみ。rep=2 は即遷移）: NpcDirector が `npc_show` → NPC が参加者の正面、会話距離（手が届く位置 + 0.45 m ≈ 0.9 m）に現れる。鏡が表示される。指示板は「15 秒間、そのアバターを見て、手を振って挨拶してください」。
   - social = with: NPC は参加者を注視し、参加者の視線が NPC に向いた瞬間（30° 以内、45° で解除のヒステリシス）と、参加者がどちらかの手を頭の高さ付近まで上げた瞬間に、左手を上げて振り返す（会釈つき、2.5 秒のクールダウン）。4〜7 秒おきと手を振るたびに笑顔（`Fcl_ALL_Fun`）。
   - social = without: NPC は立っているだけ（注視も反応もなし）。
   - 期間終了時に `greetSec / greetGazeEvents / greetHandRaises / greetNpcWaves / greetNpcSmiles` を収集データへ書き込む（同じブロックの 2 試行目の行にも残る）。
5. `Trial - Touch`: NpcDirector が `npc_trial_start` を送信。NPC は 1 秒で手の届く位置（頭から約 0.47 m）へ前進しながら prep(2 s, with 条件は注視＋会釈/手振り) → ready(1.2 s で手を胸前へ) → approach(2 cm/s で顔の 3 cm 手前まで) → hold(2 s) → retract → 会話距離へ後退。完了で `npc_done`（Item 信号 → GlobalLogic → Global 信号）→ NpcDirector が遷移。120 秒の安全タイムアウトあり。鏡はこのステートの終了で非表示。
6. `Trial - Report`: 0–10 → 操作チェック 1–7 → （評定≥1 のみ）感覚の種類（複数）→ 部位（複数）→ 行保存 → 遷移。
7. `Trial - VEQ`: NpcDirector が `rep` を見て、各ブロックの 2 試行目以外は即 `ToNextState()`。該当時は質問紙（VEQ, qID 2）の完了で遷移。ブロック 1・2 の回答は同じ qID に保存されるので、時刻順で区別する。
8. `SocialPresence`(qID 3) → `PersonalExperience`(qID 4) → `Debrief`(qID 5) → `End`: データを 1 回アップロードし、ゲートを表示。

## 3. 残作業・確認事項（優先順）

1. Web Console（手動）: 実験作成（定員 1、Allowed platforms = VR、Participant Avatar = HIDE）、質問紙 qID 1–6 を設計書 §11 の順に登録、実験 ID を `LUIDA > Configure experiment identifiers` に設定、ワールド ID 登録。
2. テスト（設計書 §16）: T2（透明アバター定数 `AG_T_ARM`/`AG_T_SHOULDER` の実測更新）、T3、T4（2 cm/s・停止位置・身長差）、T5、T6、T7（Custom Log 7 行・100 kB 未満）、T8、T10。
3. 文言・レイアウト調整: 指示文は `Instruction.asset` の Set text、パネル文言は `ReportPanel` の Legacy code 内定数 `RP_TYPES`/`RP_LOCS`、位置は `*UI` グループと `MirrorPanel` の Transform。NPC の距離・反応の閾値は `NpcController.js` 冒頭の `NPC_CFG`（`IDLE_EXTRA_DIST`, `LOOK_AT_DEG`, `HAND_RAISE_OFFSET`, `SMILE_*` など）。
4. 既知の軽微な点: ボタンは Study4Button.js の `btn_cfg` を受け取るまで非表示。`$.worldItemReference` の送信は 10 回/秒の制限があるため ReportPanel は 1 フレーム 4 件ずつ送っている。

## 4. 再生成

`LUIDA > Study4 > Build PhantomTouch scene` を実行すると、PhantomTouch 用の生成物（シーン、Settings、Scripts/StateManagement/PhantomTouch、Avatars/PhantomTouch、Prefabs/PhantomTouch）を削除してから作り直す。手で加えた変更は失われるので、恒久的な変更は `Study4SceneBuilder.cs` 側に反映すること。
