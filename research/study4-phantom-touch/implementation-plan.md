# Study 4（Phantom Touch Illusion）実験ワールド 実装設計案

- 作成日: 2026-10-23
- 対象: 博士論文 第6章 "Study 4: Social Cues and Daily-Use Avatars in the Phantom Touch Illusion among Metaverse Users"（`PhD thesis Yong-Hao Hu.pdf` 物理ページ 160–183、印字ページ 134–157）
- 実装基盤: 本リポジトリ `luida-exp-template`（branch `hao/phantom-touch`、CCK 3.3.0、Unity 6）、Web Console `luida-frontend`（main @ 69fc08b）、管理ボット `project-luida-automization-bot`、ドキュメントサイト `https://luida.cluster.mu/docs/`（2026-10-23 取得）
- 根拠はファイルパス付きで示す。ドキュメント・論文と実コードが食い違う箇所は実コードを優先した（「※コード優先」と明記）。

> **訂正（2026-11-04）**: 参加者内のアバター条件は「透明アバター vs 普段使い」ではなく **「Default Avatar vs 普段使い」**。Web Console の参加者アバターモードは **DEFAULT**（`luida_default_avatar`）で、このワールドではアバター変更メニューに「Default Avatar」が表示される。本書の「透明アバター」「HIDE」「`transparent_avatar_0`」「`isTransparent`」は、それぞれ Default Avatar・DEFAULT・`luida_default_avatar`・`ag_isDefault`（行データは `avatarIsDefault`）と読み替える。Default Avatar の骨格値は未計測のため、自動判定は計測するまで無効（二段階の自己申告で進める）。現在の実装は `IMPLEMENTATION_NOTES.md` を参照。

---

## 0. 要約（この案の骨子）

| 項目 | 決定 | 主な理由 |
|---|---|---|
| 実装方針 | LUIDA の GUI（実験変数 / State Machine / State-listening Items / 質問紙 / Data Collector / アバター登録）を主軸にし、Cluster Script を書くのは **NPC 制御・アバター切替ゲート・試行内報告パネル・デバイスチェック** の 4 箇所に限定。LUIDA 本体（`Assets/ClusterMetaverseLab/...`）は **無改変** | 公開直前の本体改修リスクを避ける。GUI で済む部分は GUI に寄せる |
| 要因配置 | 参加者間変数 `social`（with / without）と `order`（daily_first / assigned_first）をサーバ均衡割付。参加者内変数 `block`（1,2）× `rep`（1,2）を非ランダムで 4 試行生成し、アバター条件（daily / assigned）は `order` × `block` から導出 | 参加者内変数の `isRandom` は反復をブロック化しない（交互配列になり得る）ため、順序のカウンターバランスは参加者間変数で行う |
| ステート構成 | LUIDA 標準の **試行ループ**（`Trial - Start` … `Trial - Rest`）を使い、ループ内に Setup / Touch / Report / VEQ1 / VEQ2 を置く。`rep` と `block` による「即スキップ」でブロック構造を表現 | LUIDA の想定どおりの使い方で設定量が最小。試行関連ステートでは GUI の `If` ゲートが使える。ProteusSample（`Trial - Rest` に VEQ を束縛して 2 試行で 2 回回答）と同じ仕組みに依存する。試行ループ内での質問紙の再表示は 2026-10-23 にテストで確認済み |
| 試行内報告 | 0–10 評定・操作チェック・感覚の種類/部位は **自作ボタンパネル**（State-listening Item ＋ CCK Interact Item Trigger）で取得し、NPC 計測値と同じ 1 行に保存 | 評定 0 のときの分岐（種類/部位をスキップ）が可能。Web Console の回答 DB は sID を持たず試行との対応付けが曖昧になる |
| NPC | 既存 `YoungAvatar.vrm`（または任意の VRM）を LUIDA のアバター登録でラッパー化し、`AvatarSyncClone.js` の代わりに自作 `NpcController.js`（2 ボーン IK で 2 cm/s のリーチ、注視・反応アニメーション）を載せる | Cluster Script の HumanoidAnimation/HumanoidPose は **プレイヤー専用**でアイテムには適用できない。サブノード回転 API で骨を直接動かすのが唯一の手段（LUIDA のアバター同期と同じ方式） |
| 自己アバター | Web Console の参加者アバターモード **HIDE**（入室時 `transparent_avatar_0` を割当 ＋ UGC アバター許可）を前提に、ブロック開始時に参加者自身で切替 → 骨格シグネチャで自動判定 → 「着替えました」ボタン → 2 段階目の確認 | ユーザ指定の手順そのまま。自動判定で「変えたつもり」「別アバターのまま」を検出できる。透明アバターの再選択は確認済み。アバター条件は 1 ワールド内で切り替わるため、Study 2 のようなポータルによるワールド間移動は不要 |
| データ | 試行ごとに 1 行（条件・評定・操作チェック・種類/部位・NPC 手–頭距離・頭部軌跡 10 Hz・アバター身長/腕長）を Data Collector に蓄積し、**End で 1 回だけ**アップロード。ルームログは補完 | `uploadCustomData` は同名ファイルを **上書き**（`luida-frontend/app/api/experiments/[experimentId]/customData/route.ts` L540–559）。複数回アップロードすると前の行が消える |
| 追加アセット | NPC 用 VRM（既存 `YoungAvatar.vrm` で可）、ボタン用プリミティブ、床マーカー、質問紙テキスト（VEQ はテンプレあり。社会的プレゼンス・個人経験・同意・デブリーフは新規登録） | 既存資産で足りる。3D モデルの新規購入は不要 |

---

## 1. 第6章から抽出した実装要件

| 要件 | 内容（根拠ページは物理ページ） | 実装上の意味 |
|---|---|---|
| 計画 | 2×2 混合計画。参加者間: 社会的手がかり（with/without）。参加者内: アバター（daily-use / assigned）、順序はカウンターバランス（p.163） | 参加者間 2 変数（social, order）をサーバ均衡割付 |
| 社会的手がかり | NPC の振る舞いで操作。with: 参加者に **注視とアニメーションで反応**。without: **リーチ動作のみ**。NPC を使うのは刺激を一定にするため（p.163） | NPC は全員同一モデル。with/without で頭・目・補助動作のみ切替、腕のリーチ運動学は同一 |
| 参加者 | HMD で参加する Cluster ユーザ、普段使いアバターを持つ者。LUIDA のデバイス制限で非 HMD を排除（p.163）。18 歳以上、同意は VR 内（p.164） | `allowedPlatforms = [VR]`、同意は Start ステートの質問紙 |
| 普段使いアバターの定義 | 本人が「最もよく使う」と認識するアバター。自己申告で確認（p.164） | 確認ボタン＋二段階確認（ユーザ指定どおり） |
| 刺激 | NPC は全員共通の 1 体。assigned アバターも全員共通の 1 体（p.165）。手は **2 cm/s の一定速度**で参加者の顔へ。目標位置は **トラッキングされた頭部位置**から設定（p.166） | 本案では assigned = 透明アバター（ユーザ指定）。IK で頭部位置に合わせた目標 |
| アバター特徴の記録 | 普段使いアバターの **身長** と **ヒューマノイドか否か** を記録（p.166） | 身長（頭ボーン高）・腕長・肩幅をスクリプトで自動計測。ヒューマノイドか否かは自動判定不能なので個人経験質問紙で自己申告 |
| 手続き | ①説明・同意・普段使いアバター確認 ②デバイス・トラッキング確認 ③第 1 アバター条件: 2 試行（各試行後に主観報告＋操作チェック）→ VEQ ④第 2 条件で同じ ⑤社会的プレゼンス質問紙 ⑥個人経験質問紙・デブリーフ（p.166–167）。個人経験は **最後**に聞く（期待効果の回避） | ステート設計 §6 |
| 測度 | 主観報告 0–10（1 以上なら種類と部位）、操作チェック 1 項目（NPC が注意を向けていたか）、運動反応（手–頭距離 at 後退/振動の開始、後退距離、振動振幅；連続記録）、VEQ（各条件 2 試行目の後）、社会的プレゼンス（全試行後）、個人経験（利用時間・アバター利用時間・既知・経験回数）（p.168） | §10（報告パネル）、§12（データ） |
| 運動データの出所 | プラットフォームの **ルームログ**のアバター姿勢（p.168, p.89） | ルームログ＋世界内 10 Hz 記録の二重化（§12） |
| 規模・期間 | 約 200 名、2 週間、Amazon ギフト 2000 円、公開 2026 年 11 月（p.164, p.183） | `maxSessionCount` と期間管理（§13） |
| 除外 | 4 試行未完了を除外。運動測度は IQR 外れ値除外。第 1 試行のみの分析も行う（p.171） | 試行番号・ブロック番号を各行に保存 |

---

## 2. 実装に関係する LUIDA の仕組み（コードで確認した事実）

### 2.1 実験進行（State Machine）
- 設定は `LUIDA > Configure experiment automation > State Machine`。スクリプト: `Assets/ClusterMetaverseLab/LuidaExpTemplate/Editor/Scripts/StateMachineConfigTab.cs`。
- 固定ステートは `Trial - Start`, `Trial - Rest`, `End`（`FixedStateNames`）。前後に任意のステートを追加可能（Add State Before / During / After Trials）。`Trial - Start` から `Trial - Rest` までが試行ループで、参加者内条件の組合せ数 × Trials Count 回だけ繰り返す。試行関連ステートは `Is Repeated` を使えない（L351–356）。
- 遷移は CCK のグローバルキーで駆動: `state_triggerTransition`（次へ）、`state_triggerTransitionToRepeat`（Repeat Destination へ）、`state_currentID`（整数）。各ステートの `Objects` 子オブジェクトは `Set Game Object Active Gimmick` でそのステート中のみ有効。
- ステート名はシーン内 GameObject 名・`state_names` 配列（`Assets/_Experiment_/Settings/ExperimentVariables/<Scene>.js`）としてそのまま使われる。英数字とハイフン/アンダースコアで命名する。
- State-listening Items の **`If` ゲートは試行関連ステートと常時イベントでのみ表示**される（`ItemsManagerUIDrawer.cs` L1337）。試行外ステートで条件分岐したいときは Customized Action に `if (CONDITION['social'] === 'with') { ... }` と書く。

### 2.2 実験変数・条件割付
- 設定は `Experiment Variables` タブ。生成物: `Assets/_Experiment_/Settings/ExperimentVariables/<Scene>.js`（`within_subjects_variables`, `between_subjects_variables`, `trialsCountForEachUniqueCondition`, `state_names`）。
- ランタイム: `Runtime/Scripts/ConditionManagement/ConditionManager.js`。
  - 参加者間条件は、サーバから返る既存セッションの条件一覧（`existingConditions`）を基に **組み合わせ単位で最少使用のものをランダム選択**（`calculateBalancedAssignment`）。`social × order` の 4 セルが均衡する。
  - 参加者内条件は変数値の直積を `trialsCount` 回ずつ並べ、`isRandom` の変数群はパーティション全体をシャッフルする（L1214–1258）。**反復は連続ブロックにならない**。非ランダム変数は定義順の直積（先に定義した変数が外側のループ）。
  - `CONDITION` の値は **すべて文字列**（`'1'`, `'with'`）。`$.groupState.currentCondition` は試行外でも参加者間条件を保持する（`reset()` L1173）ので `CONDITION['social']` は全ステートで参照できる。
- 参加者間条件は `saveSessionConditions` でサーバ保存され、Participant Info のエクスポートに列として出る（`luida-frontend/app/api/experiments/[experimentId]/customData/parsed/route.ts` L218–226）。

### 2.3 State-listening Items
- 設定は `State-listening Items` タブ。生成物: `Assets/_Experiment_/Scripts/StateManagement/<Scene>/<Item>.js` と `StateListeners/<Item>.asset`。
- 各アイテムは `StateListeningItem.prefab` のインスタンス（Item / ScriptableItem / ItemLogic / GlobalLogic×3 / SetGameObjectActiveGimmick / OnCreateItemTrigger / ItemGroupMember / WorldItemReferenceList / LuidaScriptCombiner）。スクリプトはスロット 0 = `StateListeningItemBase.js`、スロット 1 = 生成スクリプト。`WorldItemReferenceList` は生成時にスクリプトで付与されるので Inspector から編集できる（NPC の参照追加に使う）。
- 利用できるアクション（`Editor/Scripts/ItemsManagerConfig/ItemsManagerUIDrawer.cs` L51–133）: Show/Hide item, Set text, Set/Add position/rotation, Show/Hide child, Set/Add child position/rotation, To next state, Sleep, Push data to collector, Save pushed data, Upload saved data, Set/Add participant position/rotation, Send Haptics, Send via OSC, Sync with participant bone, Assign/Unassign avatar, Customized Action。
- 常時イベント（L170–247）: Start, Update, $.onInteract, $.onUse, $.onGrab, $.onCollide, $.onPhysicsUpdate, $.onRide, $.onSteer, $.onTextInput。`$.onStart/$.onUpdate/$.onReceive` は LUIDA 予約。
- Customized Action で使える変数・関数（`Runtime/Scripts/StateManagement/StateListeningItemBase.js`）: `CONDITION`, `PARTICIPANTS[1]`（PlayerHandle）, `ShowItem/HideItem/SetText/ToNextState/SendDataToCollector/ProcessAndSaveCollectedData/UploadCollectedData/SendHaptics/ShowChild/HideChild/...`。
- **スクリプトからグローバル状態へ直接は書けない**（`setStateCompat`/`sendSignalCompat` の target は `"this" | "owner"` のみ、`Assets/Doc/CCK-Types.d.ts` L1400）。アイテム → グローバルの橋渡しは CCK の Global Logic（LUIDA も `LuidaFakeGimmick` でこの方式）。読み取りは `$.getStateCompat("global", key, type)` で可（`type` に `"signal"` も指定できる。`LuidaDataCollectorJsGenerator.cs` L149 が実例）。

### 2.4 質問紙（Web Console ↔ 世界内フォーム）
- Web Console 側: `Questionnaire.position`（1 始まり）が **qID**。`Question` は `title, description, position, answers（カンマ区切り文字列）, questionType, isRequired`。型は `RADIO_BUTTONS, LINEAR_SCALE, CHECKBOXES, TOGGLE, TEXT_INPUT` のみ（`luida-frontend/prisma/schema.prisma` L18–24, L136–146）。尺度の最小/最大やアンカー文言の専用フィールドは **ない**（選択肢は `answers`、アンカーは `description` に書く）。テンプレート: SSQ / IPQ / **VEQ（12 項目, 1–7）**（`app/experiments/[experimentId]/const.ts`）。テンプレから追加した質問は `answers` が空で届き、世界内では Linear Scale のとき自動で 1–7 になる（`FormController.js` `initQuestion` L105–107）。
- 世界内: ステートに qID を付けると `LUIDA-QuestionnaireByState/<StateName>/Questionnaire_p1` が生成され、そのステート中だけ有効化（`Editor/Scripts/Questionnaire/QuestionnaireEditorManager.cs` `AddOrEnableQuestionnaireForm`）。回答完了で `form_allPlayersCompleted` → `state_triggerTransition`。
- 同一アイテム内では送信後に再度開けない（`reset(false)` で `isSubmitted = true`、`FormController.js` L232–248, L301–316）。試行ループで同じステートが再訪されるときに再表示されるかは、無効化→有効化で **アイテムが再生成される**（`$.onStart` が再実行され `$.state` が空になる）かどうかに依存する。公式ドキュメント（`docs.cluster.mu/script/`、Set Game Object Active Gimmick のページ）には明記がない。一方、同梱サンプル `ProteusSample` は `Trial - Rest` に VEQ（qID 1）を束縛して 2 試行で 2 回回答させており（`Assets/_Experiment_/Settings/StateList/ProteusSample.asset`、ドキュメント Tutorial 0「two VEQ rows」）、ドキュメントの Concepts ページも「`Trial - Rest` に束縛すると毎試行表示される」と述べている。本案はこの挙動を前提にする。**2026-10-23 にテストで再表示を確認済み**。
- 回答の保存形式: `Answers { questionnaireId, answerAt, participantsIdfc(=pID), participantsRole, answer: string[] }`。**セッション ID は保存されない**（`schema.prisma` L165–174）。`questions` API は `position` で並べ替えず DB 順で返す（`app/api/cluster/route.ts` L254）ため、回答配列の順序 = 質問の作成順。質問の **作成順を崩さない**（並べ替え・編集は現状 500 になる可能性が報告されている）。
- 選択肢生成は `createItem` を 0.2 秒ごとに 3 個（11 個以上の選択肢は 0.3 秒ごとに 2 個）ずつスポーン（`FormController.js` L121–127）。

### 2.5 Data Collector とアップロード
- 設定は `LUIDA > Configure data collector`（ラベル登録＋出力フィールドのビルダー / Code モード）。生成物: `Assets/_Experiment_/Scripts/DataCollectors/<Scene>.js`。`stateLog` と `cond` は自動で各行に入る。
- ランタイム（`Runtime/Scripts/CustomDataCollection/CustomDataUploader.js`）:
  - `exp_recordCustomData`（= Save pushed data）で `$.groupState.collectedData` のスナップショットを 1 行として `$.state.customData` に追加。`collectedData` のラベルは **保存後もリセットされない**（前試行の値が残る）ので、試行ごとに全ラベルを上書きする。
  - `exp_uploadCustomData`（= Upload saved data）で `{type:"uploadCustomData", data:{data: rows}, eID, sID}` を 100 行 / 100 kB ごとに分割送信し、送信後にバッファを空にする。
  - 他アイテムからは `$.worldItemReference("LUIDA-DataCollector").send("luida_collect", {label: value, ..., __record: true, __upload: false})` で push＋保存ができる（L52–76）。送信直後の値を確実に同じ行に入れたいときはこの経路を使う。
- サーバ側（`luida-frontend/.../customData/route.ts`）: キー `data` は `data sID_<sID> pID_<pID>.json` に **PutObject で上書き**（L540–559）。※コード優先: ドキュメントは `<sID>-<chunk-index>-customData.json` に分割保存されると説明しているが、実装は同名上書き。分割送信の 2 チャンク目以降も同名で上書きするため、**1 セッションの行は合計 100 kB 以内・100 行以内**に収め、**End で 1 回だけ**アップロードする（ドキュメントも「`Upload collected data` はちょうど 1 つのアイテムに」と指示）。
- Custom Log のエクスポート（`experiment_results.csv/json`）はキー `data` の内容を行展開し、ネストは `_` で平坦化（`lib/customDataUtils.ts` L75–178）。テストスペースや Play モードのセッションは Participant Info に出ない（ドキュメント Tutorial 0）。

### 2.6 アバター
- 入室時の割当: Web Console の `participantAvatarMode`（HIDE / DEFAULT / UNRESTRICTED、既定 HIDE）と `ExpWorldAvatarSet` を管理ボットが夜間に Cluster 管理画面へ反映。HIDE のとき管理画面上の設定は `avatarID = "transparent_avatar_0"`、`allowUGC = true`（`project-luida-automization-bot/src/updateWorldRowsOnAdminPanel.js` L53–54）。つまり **入室時は透明アバター、UGC（自分の）アバターへの切替は許可**。反映は翌日（ドキュメント Tutorial 2「HIDE takes effect the next day」）。
- 世界内割当（`Runtime/Scripts/AvatarManagement/AvatarManager.js`, `AvatarSyncClone.js`, `Editor/Scripts/AvatarsConfig/VrmWrapperBuilder.cs`）: 登録した VRM からラッパー Item（Item + MovableItem + ScriptableItem + LuidaScriptCombiner[BoneMap.js, AvatarSyncClone.js]）を生成し、`createItem` で出現させてプレイヤーのボーン回転を毎フレームサブノードへ適用する。同期するのはコア 17 ボーン（＋任意で指・足・顎）。**目ボーンは含まない**。ラッパーは参加者の platform アバターを隠さない（隠すのは HIDE モードの役割）。
- 透明アバター: `Runtime/Models/transparent-avatar.vrm`（VRM0「透明人間完全」）。頭ボーン高 1.493 m、腰 0.814 m、上腕 0.237 m、前腕 0.248 m、肩幅（左右上腕間）0.332 m。Cluster 側の `transparent_avatar_0` が同一モデルかは要確認（§17）。

### 2.7 参加管理・デバイス制限・セッション上限
- `Runtime/Scripts/ParticipantHandler/ParticipantManager.js`: 入室者に PlayerScript を配り `envInfo`（isVr 等）を取得 → `checkJoinEligibility` → 不適格は `WorldGateToLuidaBar` へテレポート。適格数が `pNum` に達すると `exp_StartStateTransition`。
- サーバ: `allowedPlatforms` に `VR` のみを設定すれば HMD 以外は `PLATFORM_NOT_ALLOWED`（`app/api/cluster/route.ts` L609–630）。`maxSessionCount` でセッション数上限（放棄セッションも数える。上限到達で自動的に TESTING に戻り題名に `[CLOSED]`）。重複参加の防止は **ない**（`excludedParticipantIds` を手動管理）。
- テストモード: `ExpIdentifiers.js` の `isTestMode = true` はアップロード前処理で false に書き換えられる（`Editor/Scripts/CombineAllBeforePlayOrBuild.cs`）。Unity Play（CSEmulator）では適格性チェックが省略される。テストスペースに PC で入って確認するときは、一時的に Allowed platforms に Windows/Mac を加える。

### 2.8 身体データと Cluster Script の制限値
- ルームログ: Cluster 運営側だけが抽出でき、アバター姿勢（頭・両手は実トラッキング、他は IK 推定）が得られる（論文 p.89、`project-luida-automization-bot/src/roomLogExtractUtils.js`）。サンプリング周期・フォーマットはボット側の運用に依存し、ドキュメントサイトにも記載がないため、本案では世界内で 10 Hz の頭部軌跡も併せて記録する。
- Cluster Script の主な制限（`Assets/Doc/CCK-Types.d.ts`）: `callExternal` の request ≤ 100 kB（L1146）、`createItem` ≤ 10 回/秒（L364）、他ハンドル操作 ≤ 10 回/秒（L2310）、`setText` ≤ 1 kB（L1726）、`$.state` は Sendable のみ（数値・文字列・Vector3・Quaternion・配列・object。配列は再代入しないと反映されない）。
- `PlayerHandle.getHumanoidBonePosition/Rotation(bone)` でプレイヤーのボーンのワールド位置・回転を取得可（L2669–2678）。`SubNode.setRotation` はアイテムローカル（親相対）回転（L1655–1660）。アイテムの `HumanoidAnimation`/`HumanoidPose` は `PlayerHandle.setHumanoidPose` 用で、アイテム自身の姿勢には使えない（L1947–2060, L2460–2530）。

---

## 3. 主要な設計判断と根拠

1. **LUIDA の試行ループをそのまま使う**: 参加者内変数 `block` × `rep` で 4 試行を生成し、ブロック開始処理（アバター切替）は `rep == 1` のときだけ、VEQ は `rep == 2` のときだけ動かす。試行関連ステートでは GUI の `If` ゲートが使え、Touch/Report の設定は 1 回で済む。VEQ をブロックごとに別 qID にするため `Trial - VEQ1`（block 1）と `Trial - VEQ2`（block 2）の 2 ステートを置き、該当しないときは即スキップする。
2. **試行内報告はボタンパネル**: 評定 0 のときに種類/部位をスキップする分岐、評定と NPC 計測値の同一行保存、`Answers` に sID がない問題、の 3 点から質問紙機能は使わない。ブロック後の VEQ・全試行後の社会的プレゼンス・個人経験・同意は LUIDA 質問紙でよい。
3. **カウンターバランスは参加者間変数 `order`**: 2.2 のとおり `isRandom` ではブロック化されない。`social × order` の 4 セル均衡はサーバ割付がそのまま満たす。
4. **NPC は VRM ラッパー + 手続き的制御**: 2.8 のとおりアイテムには HumanoidPose を適用できない。LUIDA の `AvatarSyncClone.js` と同じ「ボーンのワールド回転 → 親相対回転」変換に、プレイヤーのボーン回転の代わりに IK で計算した回転を流し込む。目標位置（参加者の顔）に厳密に合わせられ、2 cm/s も正確に出せる。
5. **自己アバターの切替は参加者操作 + 自動判定 + 二段階確認**: ユーザ指定の手順。自動判定は骨の長さ（上腕・前腕・肩幅）で行い、透明アバターか否かを ±1.5 cm で識別する（腕長 0.485 m、肩幅 0.332 m は姿勢に依存しない）。
6. **アップロードは End で 1 回**: 2.5 の上書き仕様による。途中離脱者のデータは失われるが、第 6 章の分析は 4 試行完了者のみを対象とし、pInfo（入室時に自動送信）とセッション条件でドロップアウト数は数えられる。
7. **ワールド間移動（ポータル）は不要**: Study 2 の Proteus 実験では、Cluster が入室時にしかアバターを割り当てないため、条件ごとに別ワールドを用意してポータルで移動させていた（論文 p.88, p.110）。本案では参加者が同じワールド内で自分のアバターを着替えるので、2 つのアバター条件を 1 ワールド・1 インスタンスで実施できる。世界内ラッパー（LUIDA の Assign avatar）も参加者には使わない。残るゲートは、終了後に募集ワールドへ戻る `WorldGateToLuidaBar` と、不適格者を送り出す既存の仕組みだけである。ワールド移動による脱落（Study 2 では 9.2%）も生じない。

---

## 4. シーン構成

| GameObject | 種別 | 役割 |
|---|---|---|
| `LUIDA-ExpManagers`（ParticipantManager / ConditionManager / StateLogger / QuestionnaireUI / States） | LUIDA 自動生成 | 参加管理・条件・ステート |
| `LUIDA-QuestionnaireByState/<State>` | LUIDA 自動生成 | 同意・VEQ1・VEQ2・社会的プレゼンス・個人経験・デブリーフ用フォーム |
| `LUIDA-DataCollector` | LUIDA（Hierarchy 右クリック > LUIDA > Data Collector） | 行バッファとアップロード |
| `Instruction` | State-listening Item | 各ステートの指示テキスト（子 `Text` に TextView） |
| `AvatarGate` | State-listening Item | アバター切替の自動判定・2 段階確認・アバター特徴の計測（§7） |
| `DeviceCheck` | State-listening Item | 頭・両手トラッキング確認（§13） |
| `NpcDirector` | State-listening Item | ステートに応じて NPC へ指令、NPC 完了シグナルで遷移（§8–9） |
| `NPC` | 自作 Item（VRM ラッパー派生） | 接近・注視・反応・計測（§8） |
| `ReportPanel`（子: `Btn_0`…`Btn_10`, `Btn_Done`, `Label`） | State-listening Item ＋ CCK トリガー付き子アイテム | 試行内報告（§10） |
| `FloorMarker` | 静的メッシュ | 立ち位置（Setup で参加者をここへテレポート） |
| 環境 | 既存 `Template.unity` の Plane・Lighting | 無地の部屋で十分。壁は NPC の背景として簡素なもの可 |

`pNum = 1`、Web Console のルーム定員 1。

---

## 5. 実験変数タブの設定

| 区分 | Name | Values | isRandom | 備考 |
|---|---|---|---|---|
| Between | `social` | `with,without` | （参加者間は常にランダム） | サーバ均衡割付 |
| Between | `order` | `daily_first,assigned_first` | 同上 | ブロック順序のカウンターバランス |
| Within | `block` | `1,2` | □ | 先に定義（外側ループ） |
| Within | `rep` | `1,2` | □ | 後に定義（内側ループ） |
| Trials Count per Condition | `1` | | | 4 試行 = (1,1),(1,2),(2,1),(2,2) |

生成順の確認: `ConditionManager.js` `initializeWithinSubjectsConditions` は非ランダム変数を定義順に直積するため、`block` を先に定義すれば `(1,1),(1,2),(2,1),(2,2)` になる。設定後に Variables タブの試行一覧プレビューで順序を確認する。

アバター条件の導出（Customized Action で共通に使う式。`CONDITION` の値は文字列）:

```js
function avatarForBlock(block /* '1' | '2' */) {
  const dailyFirst = CONDITION['order'] === 'daily_first';
  return (dailyFirst === (block === '1')) ? 'daily' : 'assigned';
}
const AVATAR = avatarForBlock(CONDITION['block']);   // 'daily' | 'assigned'
```

---

## 6. ステートマシンタブの設定

> **2026-10-26 更新（実装時の変更）**: 実装では `Trial - Start` と `Trial - Touch` の間に `Trial - Greeting`（Has Exit Time 15 秒、`rep == 1` のときだけ実施）を追加し、NPC はここで初めて表示される。VEQ は `Trial - VEQ1/VEQ2` の 2 ステートではなく単一の `Trial - VEQ`（qID 2、`rep == 2` のときだけ回答）に統合したため、後続の qID は SocialPresence = 3、PersonalExperience = 4、Debrief = 5 になる。質問紙コンテナは初期状態で非アクティブ。鏡（CCK Mirror）を NPC の斜め後ろに置き、Greeting 開始〜Touch 終了の間だけ表示する。NPC は会話距離（手が届く位置 + 0.45 m）で待機し、試行開始時に手が届く位置まで前進する。社会的手がかり条件では挨拶期間中に注視・視線合致や挙手への手振り返し・笑顔（ブレンドシェイプを Animator 経由で再生）を行う。詳細は `IMPLEMENTATION_NOTES.md` §2。


| # | StateName | 区分 | Exit | qID | 遷移のトリガ | 主なアクション |
|---|---|---|---|---|---|---|
| 0 | `Start` | Before | 手動 | 1（同意） | 質問紙完了 | Instruction: 研究説明 |
| 1 | `DeviceCheck` | Before | 手動 | – | DeviceCheck が合格で `ToNextState()`（60 秒で救済ボタン表示） | 頭を左右に向ける、両手を頭より上に挙げる |
| 2 | `Trial - Start` | 固定（ブロック Setup を兼ねる） | 手動 | – | `rep == 2`: `If` ゲート付き `To next state` で即スキップ。`rep == 1`: AvatarGate の 2 段階確認完了で遷移 | `rep == 1` のとき: 参加者を FloorMarker へテレポート、アバター切替指示、NPC へ `npc_setup` |
| 3 | `Trial - Touch` | During | 手動 | – | NPC 完了シグナル `npc_done` を NpcDirector が検知して `ToNextState()` | NpcDirector → NPC `npc_trial_start` |
| 4 | `Trial - Report` | During | 手動 | – | ReportPanel 完了で `ToNextState()` | 0–10 → 操作チェック → （評定≥1 なら）種類 → 部位 → 行保存 |
| 5 | `Trial - VEQ1` | During | 手動 | 2（VEQ） | `block == 1 && rep == 2` 以外は Customized Action で即スキップ。該当時は質問紙完了で遷移 | NPC は待機姿勢のまま |
| 6 | `Trial - VEQ2` | During | 手動 | 3（VEQ、内容は qID 2 と同一） | `block == 2 && rep == 2` 以外は即スキップ | |
| 7 | `Trial - Rest` | 固定 | 1 秒 | – | 自動 | 休憩表示。4 試行目の後はループを抜ける |
| 8 | `SocialPresence` | After | 手動 | 4 | 質問紙完了 | NPC を見える位置に残す |
| 9 | `PersonalExperience` | After | 手動 | 5 | 質問紙完了 | |
| 10 | `Debrief` | After | 手動 | 6（デブリーフ同意確認＋報酬連絡先） | 質問紙完了 | Instruction にデブリーフ文 |
| 11 | `End` | 固定 | – | – | – | `Upload saved data`、`WorldGateToLuidaBar` 表示、NPC 非表示 |

- `Trial - VEQ1/2` のスキップ条件は 2 変数（`block` と `rep`）なので GUI の `If`（1 変数）ではなく Customized Action: `if (!(CONDITION['block'] === '1' && CONDITION['rep'] === '2')) ToNextState();`。
- 即スキップされるステートでも質問紙アイテムは一瞬生成されるが実害はない（T0 で確認）。
- `Trial - Start` のスキップ（`rep == 2`）は GUI の `If`（Var Name `rep`, Is Value `2`）＋ `To next state` で可。
- ステート名はそのまま `stateLog.name` としてデータ行に入り、`cond.block`/`cond.rep` と合わせて試行を識別する。

---

## 7. 自己アバター条件の操作（ユーザ指定フローの実装）

### 7.1 前提（Web Console / 管理ボット側）
- 実験の参加者アバターモードを **HIDE** にする（既定値）。管理ボットの夜間同期後、ワールドは「入室時 `transparent_avatar_0`、UGC アバター許可」になる（2.6）。テストスペースで確認する日も、前日までに設定しておく。
- 入室時に割り当てられた透明アバターを、参加者が一覧から **再選択できる**ことは 2026-10-23 にテストで確認済み。

### 7.2 `Trial - Start`（`rep == 1` のときのブロック Setup）の流れ
1. `NpcDirector`/`Instruction`（On State Start）: 参加者を `FloorMarker` へテレポート（`Set participant position/rotation`）。NPC へ `npc_setup` を送り、参加者の正面に配置して待機姿勢にする。
2. `AvatarGate`（On State Start, Customized Action）: `rep == 2` なら何もしない。`rep == 1` なら `avatarForBlock(CONDITION['block'])` でこのブロックの条件を決め、`$.state.target = 'daily' | 'transparent'`、`$.state.step = 1`、`$.state.setupStartTs = Date.now()`。指示文を AvatarGate 自身の子 `Text` に表示。
   - daily: 「メニューを開き、普段いちばんよく使うアバターに着替えてください。着替え終わったら〈着替えました〉ボタンを押してください。」
   - transparent: 「メニューを開き、この実験で最初に着ていた透明アバターに着替えてください。着替え終わったら〈着替えました〉ボタンを押してください。」（アバターの表示名はテストで確認して明記する）
3. `AvatarGate`（During State）: 毎フレーム骨格シグネチャを計測し、`isTransparent` を判定。目標と一致している間だけ〈着替えました〉ボタン（子 `Btn_Changed`）を表示（`ShowChild/HideChild`）。不一致なら注意文（「まだ透明アバターのままです」「まだ普段使いアバターになっていません」）。
4. 〈着替えました〉押下（子アイテムの `Interact Item Trigger` → 対象 Specified Item = AvatarGate, キー `gate_btn` Integer = 1）→ `$.state.step = 2`、2 段階目の確認文と〈はい〉〈いいえ〉ボタンを表示。
   - daily: 「いま着ているアバターは、あなたが普段最もよく使うアバターですか？」
   - transparent: 「いま着ているのは透明アバターですか？（自分の体が見えない状態）」
5. 〈はい〉（`gate_btn` = 2）→ アバター特徴を記録し、Setup 行を保存（`ProcessAndSaveCollectedData()`）して `ToNextState()`。〈いいえ〉（`gate_btn` = 3）→ step 1 に戻る（同一ステート内で完結するためステートマシンの分岐は不要）。
6. 〈はい〉を押した時点でシグネチャが目標と不一致なら押下を無効にして注意文を出す（自動判定と自己申告の二重チェック）。

### 7.3 骨格シグネチャ（Customized Action の骨子）

```js
// AvatarGate: Update（常時）または During State
const T_ARM = 0.485, T_SHOULDER = 0.332, TOL = 0.015; // transparent-avatar.vrm の実測値（T2 で実機の値に更新）
function signature(p) {
  const ua = p.getHumanoidBonePosition(HumanoidBone.LeftUpperArm);
  const la = p.getHumanoidBonePosition(HumanoidBone.LeftLowerArm);
  const h  = p.getHumanoidBonePosition(HumanoidBone.LeftHand);
  const rua = p.getHumanoidBonePosition(HumanoidBone.RightUpperArm);
  const head = p.getHumanoidBonePosition(HumanoidBone.Head);
  const root = p.getPosition();
  if (!ua || !la || !h || !rua || !head || !root) return null;   // アバター読込中は null
  return {
    armLen: ua.clone().sub(la).length() + la.clone().sub(h).length(),
    shoulder: ua.clone().sub(rua).length(),
    headH: head.y - root.y,
    hipsH: (p.getHumanoidBonePosition(HumanoidBone.Hips) || root).y - root.y,
  };
}
function isTransparent(s) {
  return s && Math.abs(s.armLen - T_ARM) < TOL && Math.abs(s.shoulder - T_SHOULDER) < TOL;
}
```

- 判定は 1 秒間連続で同じ結果のときだけ採用する（アバター読込中のぶれ対策）。
- 〈はい〉確定時に `SendDataToCollector('avatarArmLen', s.armLen)`, `'avatarShoulder'`, `'avatarHeadH'`, `'avatarHipsH'`, `'avatarIsTransparent'`, `'avatar'`（daily/assigned）, `'setupSec'`（切替所要秒）, `'setupRetry'`（〈いいえ〉の回数）を push。身長の代理指標は `avatarHeadH`（頭ボーン高。頭頂は分析時に +0.1 m 程度の補正）。
- ヒューマノイドか否かは自動判定できないため、個人経験質問紙に「普段使いアバターは人型か」を 1 問入れる。

### 7.4 第 2 ブロック
同じ `Trial - Start` が `block == 2, rep == 1` で再訪されるので設定の複製は不要。目標は `avatarForBlock('2')` で自動的に反転する。

### 7.5 ワールド間移動が不要になる理由
- 両アバター条件を同じワールド・同じインスタンス内で、参加者自身の着替えで切り替える。Study 2 のような条件別ワールドとポータルは使わない（§3 の 7）。
- 透明アバターの再選択が確認済みのため、旧版にあった代替案（透明 VRM の事前配布など）は不要になった。

---

## 8. NPC の設計（社会的手がかりの操作）

### 8.1 モデルとアイテム構築
1. NPC 用 VRM を `LUIDA > Configure avatars` にドロップして登録する（avatarID 例: `NpcBody`）。既存の `Assets/_Experiment_/Avatars/ProteusSample/Source/YoungAvatar.vrm`（VRoid 系、目ボーンあり、頭高 1.48 m、上腕 0.212 m・前腕 0.237 m）で可。別のモデルを使う場合も VRM 0.x/1.0 の人型であればよい。
2. 生成された `Assets/_Experiment_/Avatars/<Scene>/Wrappers/NpcBody.prefab` と `Generated/NpcBody_BoneMap.js` を複製し、`Assets/_Experiment_/Prefabs/NPC/NPC.prefab` と `Assets/_Experiment_/Scripts/NPC/NPC_BoneMap.js` にする（アバター登録の再ビルドで上書きされないようにするため）。
3. `NPC.prefab` の `LuidaScriptCombiner` のスクリプトを `[NPC_BoneMap.js, NpcController.js]` に差し替える（`AvatarSyncClone.js` は外す）。`NPC_BoneMap.js` の `BONE_MAP` に `LeftEye`/`RightEye`（サブノード名は VRM の目ボーン名、rest は identity）を手で追加する。
4. `NPC.prefab` に CCK `Global Logic` を 1 つ追加: Trigger = Item signal `npc_done` → Global signal `npc_done`（NPC 完了を状態機械に伝える橋渡し。2.3 参照）。
5. `NPC.prefab` に `WorldItemReferenceList` を追加し `LUIDA-DataCollector` を参照登録（試行計測値を `luida_collect` で送るため）。
6. `NpcDirector`（State-listening Item）の `WorldItemReferenceList` に `NPC` を追加。
7. NPC の表示/非表示は `Set Game Object Active Gimmick` を NPC の子（メッシュ）に付けて Global キー `npc_visible` で制御するか、End まで常時表示にする（End の後は `WorldGateToLuidaBar` へ誘導するだけなので非表示でなくてもよい）。

### 8.2 NpcController.js の構造（骨子）

```js
// 共通: AvatarSyncClone.js と同じ boneNodes キャッシュ・quaternion ヘルパを流用
const REACH_SPEED = 0.02;      // m/s（論文 §6.2.3）
const PREP_SEC = 2.0;          // 開始前の待機（with: 注視・挨拶）
const HOLD_SEC = 2.0;          // 接触後の保持
const RETRACT_SPEED = 0.10;    // 戻り速度
const FACE_OFFSET_LOCAL = new Vector3(0, 0.05, 0.10); // 頭ボーン→顔表面（頭ボーン回転系）
const STOP_MARGIN = 0.03;      // 顔表面から 3 cm 手前で停止（カメラ貫通防止）
const SAMPLE_INTERVAL = 0.1;   // 10 Hz で軌跡記録

$.onStart(() => { cacheBones(); $.state.phase = "idle"; $.state.social = false; });

$.onReceive((type, arg) => {
  if (type === "npc_setup")       { $.state.social = !!arg.social; placeInFrontOf(participant(), 0.9); $.state.phase = "idle"; }
  if (type === "npc_trial_start") { $.state.trial = arg; startTrial(); }
});

$.onUpdate((dt) => {
  const p = participant(); if (!p || !p.exists()) return;   // participant(): $.getPlayersNear($.getPosition(), Infinity)[0]（pNum = 1）
  const headPos = p.getHumanoidBonePosition(HumanoidBone.Head);
  const headRot = p.getHumanoidBoneRotation(HumanoidBone.Head);
  if (!headPos || !headRot) return;

  // 1) 姿勢の決定（アイテムローカル座標、正規化スケルトン規約: T ポーズ = identity）
  const pose = restIdle();                       // 両腕を体側へ下ろした待機姿勢
  if ($.state.social) applyGaze(pose, headPos);  // 頭 70%・首 30%・目で参加者の頭を注視（±60°/±30° に制限）
  if ($.state.social) applyIdle(pose, dt);       // 呼吸様の微小動揺、挨拶ジェスチャ（8.3）
  stepReach(pose, dt, headPos, headRot);         // 2) リーチ相（8.4）
  applyPose(pose);                               // 3) AvatarSyncClone と同じ world→local 変換でサブノードへ
  sampleTrace(dt, headPos, headRot);             // 4) 10 Hz 記録（8.5）
});
```

### 8.3 社会的手がかりの実装（with 条件のみ有効）
| 手がかり | 実装 | without 条件 |
|---|---|---|
| 注視 | 毎フレーム、NPC 頭ボーン位置から参加者頭ボーン位置への方向を求め、頭 70%・首 30% に配分して回転。目ボーンにさらに ±15° の追従。可動域外では上体（Spine）を 10° まで補助回転 | 頭・目は正面固定 |
| 反応アニメーション | 試行開始の PREP 相で、参加者が NPC を見た（参加者頭の前方ベクトルと NPC 頭への方向の角度 < 20°）瞬間に **会釈（頭を 15° 前傾 0.6 s）＋左手を胸の高さに上げて 1.5 s 振る**。見ない場合は PREP 終了時に会釈のみ | なし |
| 接近中の上体 | Spine を参加者側へ 5° 前傾、接触保持中に小さく頷く | 直立のまま |
| 微小動揺 | Chest に 0.25 Hz・±1° の呼吸様回転 | 静止 |

挨拶の有無・参加者が NPC を見たか（`lookedAtNpc`、時刻）を試行行に記録し、操作チェックの解釈に使う。

### 8.4 リーチ相（2 ボーン IK）
- 開始時: 手先位置 `H0`（右手ボーン＋指先オフセット 0.08 m）、目標 `T = headPos + headRot * FACE_OFFSET_LOCAL`（論文どおり頭部トラッキング位置から設定。試行開始時に固定し、以後は参加者が前に出た場合のみ接触判定で早期停止）。経路長 `L = |T − H0| − STOP_MARGIN`、所要 `L / 0.02` 秒（例: 0.36 m → 18 s）。
- 毎フレーム: 手先目標 `Ht = H0 + dir * min(0.02 * t, L)`。
- IK: 肩位置 `S`（RightUpperArm サブノードの global position）、上腕長 `L1`・前腕長 `L2`（起動時にサブノード位置から実測）。余弦定理で肘角 `acos((L1²+L2²−d²)/(2L1L2))`、肩角 `acos((L1²+d²−L2²)/(2L1d))`。肘は `dir` と「下＋外側」ヒントベクトルの張る平面内に置く。
- 回転への変換: 上腕の rest 軸 `a0 = normalize(rest(LowerArm) − rest(UpperArm))`（起動時にアイテムローカルで実測）に対し `Q_upper = rotationFromTo(a0, normalize(E − S))`、前腕も同様に `Q_lower = rotationFromTo(a0', normalize(Ht − E))`。手首は前腕に追従＋掌を顔へ向ける小回転。これらを「仮想プレイヤーボーン回転」として `AvatarSyncClone.js` L1040–1071 と同じ式（`desiredWorld = Q * rest`, `local = inv(parentWorld) * desiredWorld`）で親相対回転に変換する。`rotationFromTo` は `Quaternion.setFromAxisAngle(cross(a,b), acos(dot(a,b)))` で実装（付録 B.1）。
- 接触判定: `|fingertip − Tcurrent| ≤ STOP_MARGIN` または `t ≥ L/0.02` で接触。接触時刻・接触時の手–頭距離を記録し HOLD 相へ。
- HOLD 後に RETRACT（0.10 m/s で `H0` へ）、完了で `$.sendSignalCompat("this", "npc_done")` → Global Logic → `npc_done`。

### 8.5 試行中の計測（NPC 側で行う理由: 手の位置を正確に知っているのは NPC だけ）
10 Hz で以下を配列に蓄積し、試行完了時に 1 回だけ `luida_collect` で送る（`__record` は付けない。行の確定は Report 完了時）。

| ラベル | 型 | 内容 |
|---|---|---|
| `trace` | String | `t,hx,hy,hz,hqx,hqy,hqz,hqw,fx,fy,fz,d;...`（t: 開始からの秒 0.1 刻み、h: 参加者頭ボーン位置/回転、f: NPC 指先位置、d: 手–頭距離。小数 3 桁、約 20 s × 10 Hz ≈ 6–7 kB） |
| `reachStartTs`, `contactTs`, `retractEndTs` | Float | `Date.now()`（ms）。ルームログとの同期用 |
| `pathLen`, `reachDur` | Float | 経路長（m）・接近所要時間（s） |
| `headPos0`, `headRot0` | Vector3 / String | 接近開始時の頭位置・回転 |
| `contactDist` | Float | 接触判定時の手–頭距離 |
| `lookedAtNpc`, `lookTs`, `greeted` | Bool / Float / Bool | 8.3 |
| `social` | String | NpcDirector から受けた条件（冗長だが行内で自己完結させる） |

後退開始距離・後退距離・振動振幅（論文 Table 6.3）は `trace` から分析時に算出する（基準 = 接近開始後 1 秒の平均頭位置、接近軸 = `dir` の水平成分、後退 = 接近軸と逆向きの変位が 2 cm を超えた最初の時刻、後退距離 = 最大変位、振幅 = 線形トレンド除去後の peak-to-peak）。閾値はパイロットで決める。世界内でも同じ定義で `retreatOnsetDist`, `retreatDist`, `oscAmp` を暫定計算し、Web Console での進捗モニタに使う。

### 8.6 配置
- `npc_setup` で参加者の頭位置の水平前方 0.9 m、足元 = 参加者の root 高さに NPC を置き、参加者の方を向かせる（MovableItem の `setPosition/setRotation`）。両者の距離は IK の到達範囲（約 0.45 m + 肩オフセット）に対し余裕を持たせ、接近開始時に NPC が半歩前に出る演出（0.3 m を 1 s）を入れると自然。without 条件も同じ移動を行う（刺激の差を手がかりだけにする）。

---

## 9. `Trial - Touch` のタイムライン（1 試行 ≈ 30 s）

| 時刻 | NPC | 記録 |
|---|---|---|
| 0 s（State Start） | `NpcDirector` が `npc_trial_start {block, rep, avatar, social}` 送信。NPC は PREP 相（with: 注視＋挨拶） | `trialStartTs` |
| 2 s | 接近開始（2 cm/s） | `reachStartTs`, `headPos0`, 10 Hz 記録開始 |
| ~20 s | 接触（3 cm 手前で停止、2 s 保持） | `contactTs`, `contactDist` |
| ~22–26 s | 戻り（10 cm/s） | 記録終了 |
| 完了 | `npc_done` → NpcDirector が `ToNextState()` | NPC が `luida_collect` で計測値を push |

`NpcDirector` の設定（GUI。試行関連ステートなので `If` も使える）:
- `Trial - Start` On State Start（`If rep == 1`）: Customized Action `$.worldItemReference('NPC').send('npc_setup', { social: CONDITION['social'] === 'with' });`
- `Trial - Touch` On State Start: Customized Action
  ```js
  $.worldItemReference('NPC').send('npc_trial_start', {
    block: CONDITION['block'], rep: CONDITION['rep'],
    avatar: avatarForBlock(CONDITION['block']), social: CONDITION['social'] === 'with' });
  ```
- `Trial - Touch` During State: Customized Action `if ($.getStateCompat('global', 'npc_done', 'signal')) ToNextState();`
- `avatarForBlock` は NpcDirector の常時イベント `Start` ではなく、Customized Action 内に都度書くか、Legacy code 欄に関数定義として置く（Start 内の関数はスコープ外になるため）。

---

## 10. 試行内報告パネル（ReportPanel）

- 構成: State-listening Item `ReportPanel`。子に 11 個のボタンアイテム `Btn_0`…`Btn_10`（Cube ＋ TextView ラベル）、`Btn_Done`、見出し `Text`。各ボタンは CCK `Interact Item Trigger` → 対象 **Specified Item = ReportPanel**、キー `rp_btn`（Integer、値 = ボタン番号+1）。パネルは During State で `$.getStateCompat('this','rp_btn','integer')` を読み、処理後に `$.setStateCompat('this','rp_btn',0)` で戻す（同じボタンの連打も検出できる）。
- ステップ（`Trial - Report` 開始時に `step = 1`）:
  1. 評定: 「NPC の手が近づいたとき、顔に何か感じましたか？ 0 = まったく感じない … 10 = 非常に強く感じた」ボタン 0–10 を表示。押下で `rating` 確定。
  2. 操作チェック: 「NPC はあなたに注意を向けていると感じましたか？」1–7（ボタン 1–7 のみ表示、ラベル差替え）。`mc` 確定。
  3. 評定 ≥ 1 のときのみ: 「どんな感覚でしたか？（当てはまるものをすべて）」選択肢例: 圧迫感 / ぞわぞわ・むずむず / 温かさ / 冷たさ / 風・空気の動き / しびれ / その他 → トグル式（押すたびに ON/OFF、色で表示）＋〈決定〉。`ptype`（`"1,3"` のように連結文字列）。
  4. 評定 ≥ 1 のときのみ: 「どこに感じましたか？（すべて）」額 / 目のまわり / 頬 / 鼻・口のまわり / あご / 頭の側面・耳 / 首 / その他 → 同上。`ploc`。
  5. 完了: `SendDataToCollector` で `rating, mc, ptype, ploc, reportDoneTs` を push（評定 0 のときは `ptype = ploc = ''` を明示的に上書きする。2.5 のとおりラベルは前試行の値が残る）→ `ProcessAndSaveCollectedData()`（この時点で NPC が送った `trace` 等と同じ行に入る）→ `ToNextState()`。
- 選択肢の文言・数はパネルのスクリプト定数で管理する（4 試行で同一）。公開後は変えない。
- パネルの出現位置は参加者の頭位置から前方 1.2 m・高さ −0.2 m に毎回合わせる（Customized Action で `$.setPosition`）。NPC は報告中も待機姿勢で見えていてよい。

---

## 11. 質問紙（Web Console 登録内容）

qID は登録順（position）。**登録順を厳守**し、後から並べ替え・編集しない（2.4）。

| qID | ステート | タイトル | 質問（型） |
|---|---|---|---|
| 1 | Start | 研究説明と同意 | 説明文は description に。「18 歳以上である」(TOGGLE, 必須)、「普段使いのアバターを持っている」(TOGGLE, 必須)、「HMD で参加している」(TOGGLE, 必須)、「上記説明を理解し参加に同意する」(TOGGLE, 必須)、「VR 酔い等の際はいつでも中止できることを理解した」(TOGGLE, 必須) |
| 2 | Trial - VEQ1 | VEQ（ブロック 1） | テンプレ VEQ 12 項目（LINEAR_SCALE、空 answers → 世界内で 1–7） |
| 3 | Trial - VEQ2 | VEQ（ブロック 2） | qID 2 と同内容を再登録 |
| 4 | SocialPresence | NPC との共在感・社会的プレゼンス | 文献 [178] の項目を LINEAR_SCALE `1,2,3,4,5,6,7`、アンカーは description に |
| 5 | PersonalExperience | 個人経験 | メタバース利用時間（時間/週）(TEXT_INPUT)、普段使いアバターの利用期間（月）(TEXT_INPUT)、普段使いアバター利用時間（時間/週）(TEXT_INPUT)、普段使いアバターは人型か (RADIO: 人型/人型でない/その他)、ファントムタッチ（V 感・ファントムセンス）を知っていたか (RADIO)、他のアバターに触れられて感じた経験の回数 (RADIO: 0/1–2/3–9/10 回以上)、年齢・性別 (RADIO/TEXT)、使用 HMD (RADIO) |
| 6 | Debrief | デブリーフ・報酬 | デブリーフ文は description。「説明を読んだ」(TOGGLE)、「データ利用に引き続き同意する」(TOGGLE)、「ギフト券送付先メールアドレス」(TEXT_INPUT, 必須) |

- 同意文の全文は Web Console の ConsentForm（募集ワールド側で表示）と、qID 1 の description の両方に入れる。
- `TEXT_INPUT` は Cluster の文字入力 UI を使うため VR でも入力可（250 文字まで）。数値回答は自由記述で受け、分析時に数値化する。

---

## 12. データ収集（Data Collector 設定とスキーマ）

### 12.1 Data Collector の設定
`LUIDA > Configure data collector` でラベルを登録（String を多用するため、GUI の Push ギミックではなく Customized Action の `SendDataToCollector` と NPC の `luida_collect` で送る）。出力フィールドはビルダーで「Collected」を 1 対 1 に並べる（または Code モードで下記）。

```js
// Assets/_Experiment_/Scripts/DataCollectors/<Scene>.js（Code モードの例）
return {
  stateLog: COLLECTED_DATA["stateLog"],   // {id, name, startAt}
  cond: CONDITION || {},                  // social, order, block, rep
  avatar: COLLECTED_DATA["avatar"],
  rating: COLLECTED_DATA["rating"], mc: COLLECTED_DATA["mc"],
  ptype: COLLECTED_DATA["ptype"], ploc: COLLECTED_DATA["ploc"],
  social: COLLECTED_DATA["social"], lookedAtNpc: COLLECTED_DATA["lookedAtNpc"], greeted: COLLECTED_DATA["greeted"],
  reachStartTs: COLLECTED_DATA["reachStartTs"], contactTs: COLLECTED_DATA["contactTs"], retractEndTs: COLLECTED_DATA["retractEndTs"],
  pathLen: COLLECTED_DATA["pathLen"], reachDur: COLLECTED_DATA["reachDur"], contactDist: COLLECTED_DATA["contactDist"],
  retreatOnsetDist: COLLECTED_DATA["retreatOnsetDist"], retreatDist: COLLECTED_DATA["retreatDist"], oscAmp: COLLECTED_DATA["oscAmp"],
  trace: COLLECTED_DATA["trace"],
  avatarArmLen: COLLECTED_DATA["avatarArmLen"], avatarShoulder: COLLECTED_DATA["avatarShoulder"],
  avatarHeadH: COLLECTED_DATA["avatarHeadH"], avatarHipsH: COLLECTED_DATA["avatarHipsH"], avatarIsTransparent: COLLECTED_DATA["avatarIsTransparent"],
  setupSec: COLLECTED_DATA["setupSec"], setupRetry: COLLECTED_DATA["setupRetry"],
  deviceCheckSec: COLLECTED_DATA["deviceCheckSec"], deviceCheckForced: COLLECTED_DATA["deviceCheckForced"],
  reportDoneTs: COLLECTED_DATA["reportDoneTs"],
};
```

### 12.2 行の種類と保存タイミング
| 行 | 保存（`ProcessAndSaveCollectedData` / `__record`）のタイミング | 備考 |
|---|---|---|
| 試行行 ×4 | 各 `Trial - Report` の完了時 | NPC 計測値＋報告が同一行。`cond.block/rep` で試行識別 |
| セットアップ行 ×2 | `Trial - Start`（`rep == 1`）の〈はい〉確定時 | アバター特徴・切替所要時間・やり直し回数 |
| デバイスチェック行 ×1 | DeviceCheck 合格時 | 合格までの秒数、救済ボタン使用の有無 |

合計 7 行・推定 30–40 kB（trace が主）。100 kB 制限内。**`Upload saved data` は End の On State Start に 1 回だけ**配置する（2.5）。試行行以外では `trace` 等に前試行の値が残るため、Setup/DeviceCheck 行の保存前に不要ラベルを `''` で上書きするか、分析時に `stateLog.name` で行種別を判定する。

### 12.3 ルームログとの対応付け
- 各行の `reachStartTs` 等は `Date.now()`（ワールドサーバ時刻, ms）。ルームログ抽出時はセッションの `idfc2userId` とこの時刻で区間を切り出す。
- 世界内 `trace` は NPC の手位置を含むため、手–頭距離の時系列はこちらが一次データになる。ルームログは頭部回転の高頻度データ・欠損時のバックアップとして使う。

### 12.4 Web Console で確認できるもの
- Participant Info: sID, pID, 入室時刻, device, os, `social`, `order`（本番セッションのみ）。
- Custom Log: 上記行を `stateLog_name`, `cond_social`, `cond_block`, … と平坦化した CSV。
- Standard Questions: qID 1–6 の回答（pID・時刻付き。sID なし → pID で結合）。

---

## 13. 参加資格・同意・デバイスチェック・報酬

- デバイス制限: Web Console の Allowed platforms を **VR のみ**。世界側は `ParticipantManager.js` が非適格者をゲートへ送る（本番ワールドのみ有効）。
- 同意: qID 1（§11）。「同意しない」を選べる設計にする場合は RADIO（同意する/しない）にし、`Instruction` に「同意しない方はメニューから退出してください」と表示（ステート分岐は作らない）。
- DeviceCheck ステート（State-listening Item `DeviceCheck`, During State）: `PARTICIPANTS[1]` の頭ボーン回転から左右ヨー ±30° を各 1 回、両手ボーン位置が頭より高い状態を 1 秒、を検出したら合格。60 秒経過で〈トラッキングが確認できない場合はこちら〉ボタンを出し、押下で合格扱い＋`deviceCheckForced = true` を記録。
- セッション上限: `maxSessionCount` を 230 程度（放棄セッションも数える）。2 週間の期限は手動で status を TESTING に戻す（サーバに期限機能はない）。
- 重複参加: サーバ側に防止機能がないため、Participant Info の pID 重複を分析時に除外し、必要なら `excludedParticipantIds` に追加する。
- 報酬: qID 6 でメールアドレスを収集し、終了後に研究者が送付（論文 p.89–90 の運用）。

---

## 14. 必要アセット一覧

| 用途 | 既存で済むもの | 新規に必要なもの |
|---|---|---|
| NPC の身体 | `Assets/_Experiment_/Avatars/ProteusSample/Source/YoungAvatar.vrm`（または ElderAvatar.vrm） | 別の中立的な VRM を使いたい場合のみ（人型・目ボーン必須。VRoid 製で可） |
| 参加者の assigned アバター | Cluster 側 `transparent_avatar_0`（HIDE モード）／`Runtime/Models/transparent-avatar.vrm` | なし |
| ボタン・パネル | Unity プリミティブ（Cube/Quad）＋ CCK TextView（`Assets/Fonts`） | なし |
| 床マーカー | Quad ＋ 任意のテクスチャ | なし |
| 環境 | `Template.unity` の Plane・ライト | 任意（簡素な壁 2–3 枚） |
| 質問紙 | VEQ テンプレ、同意文の既定文 | 社会的プレゼンス尺度の訳文、個人経験項目、デブリーフ文 |
| スクリプト | `AvatarSyncClone.js`（数式を流用）、`HandRedirection/RightHand.js`（ボーン追従の例） | `NpcController.js`、`NPC_BoneMap.js`（生成物の複製）、`AvatarGate`/`ReportPanel`/`DeviceCheck`/`NpcDirector` の Customized Action |

---

## 15. 実装手順（チェックリスト）

1. Web Console: 実験を新規作成（ルーム定員 1、ステータス テスト中、Allowed platforms = VR（テスト期間中は Windows/Mac も）、参加者アバターモード HIDE）。質問紙 qID 1–6 を §11 の順に登録。実験 ID をコピー。
2. Unity: `LUIDA > Scene > Create new scene`（例: `PhantomTouch`）。`LUIDA > Configure experiment identifiers` で Access Token でログインし Experiment ID を設定。
3. `Configure experiment automation` → Activate。Experiment Variables に §5 を入力し、試行一覧プレビューで順序を確認。
4. State Machine に §6 のステートを作成（Add State Before / During / After Trials）。qID を付与。`Trial - Rest` は Has Exit Time 1。
5. Hierarchy 右クリック > LUIDA > Data Collector。`Configure data collector` で §12 のラベル登録（または Code モード）。
6. `Configure avatars` で NPC 用 VRM を登録 → ラッパーと BoneMap を複製して `NPC.prefab` を作成（§8.1）。`NpcController.js` を実装。
7. State-listening Items を作成: `Instruction`, `AvatarGate`, `DeviceCheck`, `NpcDirector`, `ReportPanel`。各セルにアクションを設定（§6–10）。`NpcDirector` の WorldItemReferenceList に `NPC` を追加。
8. ReportPanel・AvatarGate の子ボタンを作成し、Interact Item Trigger（Specified Item）を設定。
9. End に `Upload saved data` を配置。`WorldGateToLuidaBar` は ParticipantManager 配下の既存ゲートを使う（End で表示位置を参加者前に移動）。
10. `Cluster > 設定` でベータ機能を有効化 → テスト用アップロード → テストスペースで §16 を実施（T0 → T1 の順）。
11. ワールド ID を Web Console に登録 → 管理ボットの夜間同期（参加者アバターモードの反映）を待つ → 本番アップロード → Allowed platforms を VR のみに戻す → ステータス公開中。

---

## 16. テスト計画（テストスペース）

| # | 検証項目 | 合格条件 |
|---|---|---|
| T0 | 試行ループ内の質問紙再表示 | **確認済み（2026-10-23）** |
| T1 | HIDE モードで入室 → 自分のアバターへ切替 → 透明アバターへ再切替 | **確認済み（2026-10-23）** |
| T2 | AvatarGate の自動判定 | 自分のアバター/透明アバターで `isTransparent` が正しく切り替わる。切替直後 1–2 秒の null を吸収。実機の `armLen`/`shoulder` を記録して定数を更新 |
| T3 | アバター切替後も PlayerHandle・PlayerScript・ボーン取得が継続 | 切替後に `getHumanoidBonePosition` が non-null に戻る。ParticipantManager が二重登録しない |
| T4 | NPC のリーチ | 速度 2 cm/s（trace の d の傾きで確認）、顔の 3 cm 手前で停止、身長の異なるアバター（小柄・大柄な VRM）で目標に届く |
| T5 | with/without の差 | without で頭・目が動かない、挨拶が出ない。with で注視が追従する |
| T6 | ReportPanel | 評定 0 で種類/部位がスキップされる。連打で二重遷移しない。評定 0 の行で `ptype/ploc` が空 |
| T7 | データ | End 後に Custom Log に 7 行、trace が欠けていない、合計 < 100 kB。Participant Info（本番のみ）に `social`/`order`。Standard Questions に qID 1–6 |
| T8 | 均衡割付 | 4 セッション連続で `social × order` の 4 セルが 1 回ずつ |
| T9 | 非 VR 入室 | 本番アップロード後に PC で入室するとゲートへ送られる |
| T10 | 所要時間 | 1 セッション 15–20 分以内 |

---

## 17. リスクと未確認事項

| 優先 | 事項 | 対応 |
|---|---|---|
| 解決 | 試行ループ内で質問紙が再表示されるか（2.4） | 確認済み。付録 A は不要 |
| 解決 | 透明アバターの再選択可否（7.1） | 確認済み。ポータルによるワールド間移動も不要 |
| 中 | アバター着替え後も PlayerHandle・ボーン取得・PlayerScript が途切れないか | T3 で確認 |
| 高 | Cluster 側 `transparent_avatar_0` の骨格が `transparent-avatar.vrm` と同一か | T2 で実測し `T_ARM`/`T_SHOULDER` を更新 |
| 高 | アップロードの上書き仕様（2.5。ドキュメントの説明と実装が異なる） | End で 1 回のみ。LUIDA 側の改善案: サーバで追記、またはチャンク番号をファイル名に含める |
| 中 | HIDE モードの反映が翌日 | テスト日程に 1 日の余裕を取る |
| 中 | ルームログの頻度・欠損 | 世界内 trace を一次データにし、ルームログは補完 |
| 中 | サブノード回転の補間遅延 | 2 cm/s では問題になりにくいが、T4 で手の実位置（`getGlobalPosition`）と目標の差を記録して確認 |
| 中 | VR での文字入力負荷（qID 5, 6） | 数値回答は RADIO の区分でも可。メールのみ TEXT_INPUT |
| 低 | 質問 API の順序（DB 順） | 作成順を守る。回答 CSV の `QnPosition` と突合 |
| 低 | 重複参加 | pID で分析時に除外 |
| 低 | 試行外ステートで GUI の `If` が使えない（2.1） | Start/DeviceCheck/After の条件分岐は Customized Action で書く |

---

## 付録 A: 代替案 — 明示ステート構成（T0 確認済みのため現在は不要。記録として残す）

- 参加者内変数を定義せず（Trials Count 1）、`Trial - Start`/`Trial - Rest` は Has Exit Time 1 秒で素通りさせる。2 ブロック × 2 試行を Before Trials に展開し、質問紙インスタンスは各ステートで 1 回しか使わない。
- ステート: `Start`(qID1) → `DeviceCheck` → `B1_Setup` → `B1_T1_Touch` → `B1_T1_Report` → `B1_T2_Touch` → `B1_T2_Report` → `B1_VEQ`(qID2) → `B2_Setup` → `B2_T1_Touch` → `B2_T1_Report` → `B2_T2_Touch` → `B2_T2_Report` → `B2_VEQ`(qID3) → `Trial - Start` → `Trial - Rest` → `SocialPresence`(qID4) → `PersonalExperience`(qID5) → `Debrief`(qID6) → `End`。
- 変更点: `avatarForBlock('1'|'2')` のブロック番号と `npc_trial_start` の `block/rep` をステートごとに定数で書く（State-listening Items タブのリスナー複製機能で 4 回分を複製）。試行外ステートでは GUI の `If` が出ないため、条件は Customized Action に書く。行の試行識別は `stateLog.name`（例: `B2_T1_Report`）で行う。
- NPC・ReportPanel・AvatarGate・DeviceCheck・Data Collector の設計は主案と同一。

## 付録 B: 主要スクリプトの実装メモ

### B.1 `rotationFromTo(a, b)`
```js
function rotationFromTo(a, b) {
  const an = a.clone().normalize(), bn = b.clone().normalize();
  const d = Math.max(-1, Math.min(1, an.dot(bn)));
  if (d > 0.9999) return new Quaternion(0, 0, 0, 1);
  if (d < -0.9999) { // 反平行: 任意の直交軸で 180°
    const axis = Math.abs(an.x) < 0.9 ? new Vector3(1,0,0).cross(an) : new Vector3(0,1,0).cross(an);
    return new Quaternion().setFromAxisAngle(axis.normalize(), 180);
  }
  const axis = an.clone().cross(bn).normalize();
  return new Quaternion().setFromAxisAngle(axis, Math.acos(d) * 180 / Math.PI); // setFromAxisAngle は度
}
```

### B.2 2 ボーン IK（肘位置）
```js
function solveElbow(S, T, L1, L2, bendHint) {
  const toT = T.clone().sub(S); let d = toT.length();
  d = Math.max(0.01, Math.min(L1 + L2 - 0.001, d));
  const dir = toT.normalize();
  const cosS = (L1*L1 + d*d - L2*L2) / (2*L1*d);
  const angS = Math.acos(Math.max(-1, Math.min(1, cosS)));           // 肩での開き角（rad）
  const n = dir.clone().cross(bendHint).normalize();                  // 曲げ平面の法線
  const q = new Quaternion().setFromAxisAngle(n, angS * 180 / Math.PI);
  const elbowDir = dir.clone().applyQuaternion(q);
  return S.clone().add(elbowDir.multiplyScalar(L1));
}
```
`bendHint` は右腕なら「下＋外側」を NPC ローカルで指定。

### B.3 trace の圧縮
```js
function pushSample(t, head, headRot, finger, d) {
  const f = (v) => v.toFixed(3);
  traceBuf.push([t.toFixed(1), f(head.x), f(head.y), f(head.z),
    f(headRot.x), f(headRot.y), f(headRot.z), f(headRot.w), f(finger.x), f(finger.y), f(finger.z), f(d)].join(","));
}
// 完了時: $.worldItemReference("LUIDA-DataCollector").send("luida_collect", { trace: traceBuf.join(";"), ... });
```
`$.state` への配列反映は再代入が必要。フレームごとの再代入を避けるため、ローカル変数（`let traceBuf`）に溜めて 1 秒ごとに `$.state.traceBuf = traceBuf` で退避する（スクリプトの内部状態は定期的に再初期化されるため、`$.state` からの復元処理も入れる）。

### B.4 ReportPanel のボタン読み取り
```js
// During State（Customized Action）
const b = $.getStateCompat('this', 'rp_btn', 'integer');
if (b > 0) { $.setStateCompat('this', 'rp_btn', 0); onButton(b - 1); }
```
`onButton` は `$.state.step` に応じて `rating/mc/ptype/ploc` を更新し、ラベル（子 `Btn_k/Text` の `setText`）を差し替える。表示切替は `ShowChild/HideChild`。

### B.5 AvatarGate / ReportPanel の関数置き場
State-listening Item の常時イベント `Start`/`Update` は `function Start() {...}` の中に展開されるため、そこで定義した関数は他のアクションから見えない。複数アクションで共有する関数（`signature`, `avatarForBlock`, `onButton` 等）は、アイテムの **Legacy code 欄**（ファイル末尾に素のまま追記される）にトップレベル関数として置くか、各 Customized Action 内に閉じて書く。
