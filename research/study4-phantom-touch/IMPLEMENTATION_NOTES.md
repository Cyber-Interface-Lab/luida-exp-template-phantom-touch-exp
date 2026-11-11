# Study 4（PhantomTouch）実装メモ

- 実装日: 2026-10-24（2026-10-26 更新: 挨拶期間・NPC 表示制御・笑顔・鏡・単一 VEQ ステート／手のひらの向きの修正。2026-11-04 更新: 表示されない不具合の修正、UI レイアウトの作り直し、顔を撫でる動作。2026-11-07 更新: 同じスペースで次の参加者を迎えるセッションリセット、退出ゲートを遠方へ移動。2026-11-08 更新: 身長合わせ、無反応時の頷き、30 秒の挨拶、頬を狙う接触点と手の向き、撫で方、表情のギミック化、質問紙の上の指示文、デブリーフ文、試行内報告の選択肢の更新（英語併記、「その他」の自由記述）、注意の質問を最後へ、機器（ポーズ）確認を各ブロックの着替えの後へ移し正面に鏡、着替え指示の横にアバターメニューの写真、VEQ の指示文に「あなた」、NPC の手を 1 cm 近くまで伸ばし撫でる長さを 6 cm に。2026-11-09 更新: 試行間の休憩を 10 秒に、着替えの間も鏡を表示、挨拶の指示に具体例。2026-11-08 更新: セッションリセットを「新しく入った人に確認してから」に変更し、同じアカウントの入り直しは続きから再開できるようにした（§8）。2026-11-10 更新: 触る段階の配置を変更（正面の鏡、NPC は参加者の右後ろに立ち、横から右頬へ手を近づける。指を曲げる）、NPC のボーンマップをシーンのモデルから作り直し、撫でる動作の加減速、試行中の近い鏡、部屋（§10））
- 設計書: `implementation-plan.md`（同フォルダ）
- 生成シーン: `Assets/_Experiment_/Scenes/PhantomTouch.unity`
- 生成手段: `Assets/_Experiment_/Editor/PhantomTouch/Study4SceneBuilder.cs`（メニュー `LUIDA > Study4 > Build PhantomTouch scene`）。LUIDA のエディタ API（シーンテンプレート、State Machine タブの生成処理、State-listening Item 生成、質問紙束縛、Data Collector、アバターラッパー生成）をそのまま呼び出しているので、生成物は LUIDA の各ウィンドウでそのまま編集できる。

## 1. 生成されたもの

| 種別 | パス | 内容 |
|---|---|---|
| シーン | `Assets/_Experiment_/Scenes/PhantomTouch.unity` | テンプレート由来の環境 + 下記すべて |
| ステート | `Assets/_Experiment_/Settings/StateList/PhantomTouch.asset` | Start（質問紙なし、OK ボタン）→ Trial - Start → Trial - PoseCheck → Trial - Greeting(20 s) → Trial - Touch → Trial - Report → SocialPresence(qID3) → Trial - VEQ(qID2) → Trial - Rest(10 s) → PersonalExperience(qID4) → Debrief（質問紙なし、OK ボタン）→ End。Trial - Start から Trial - Rest までを試行数（4）だけ繰り返す（2026-11-11 に SocialPresence をループ内へ移した。§11） |
| 実験変数 | `Assets/_Experiment_/Settings/ExperimentVariables/PhantomTouch.js` | within: `block`=1,2（非ランダム）× `social`=with,without（ブロック内でランダム）、between: `order`=daily_first,assigned_first、Trials Count 1 → 4 試行（各条件 1 試行）。2026-11-11 までは social が参加者間、各ブロック `rep`=1,2 の 2 試行（§11） |
| 質問紙フォーム | シーン内 `LUIDA-QuestionnaireByState/<State>/Questionnaire_p1` | VEQ（qID 2）, SocialPresence（qID 3）, PersonalExperience（qID 4）。qID は Web Console 側の登録順と一致させること。Debrief の質問紙は 2026-11-04 に、Start の同意質問紙は 2026-11-08 に外した（qID はそのまま）。各コンテナは初期状態で非アクティブ（ステート開始時にギミックが有効化） |
| Data Collector | `Assets/_Experiment_/Scripts/DataCollectors/PhantomTouch.js`（Code モード、設定は `Settings/DataCollectorConfig/PhantomTouch.asset`） | 1 行のフィールド一覧は設計書 §12 |
| State-listening Items | `Assets/_Experiment_/Scripts/StateManagement/PhantomTouch/*.js` と `StateListeners/*.asset` | `Instruction`, `NpcDirector`, `AvatarGate`, `DeviceCheck`, `ReportPanel`, `MirrorPanel`, `ExitPortal`, `SessionReset`（§8） |
| NPC | `Assets/_Experiment_/Prefabs/PhantomTouch/NPC.prefab`（シーンに配置済み） | YoungAvatar.vrm のラッパー（モデル子オブジェクト名 `Model`。シーン上の NPC は `luida_default_avatar_02.vrm` に差し替え済み）+ `Scripts/PhantomTouch/NpcController.js` + `Avatars/PhantomTouch/Generated/NPC_BoneMap.js`（シーンのモデルから生成。胴・腕・脚・目と右手の指 15 本の計 34 ボーン、§10）+ `npc_done` を Global へ中継する GlobalLogic + 顔メッシュ `Face` の Animator（`NpcFace.controller`: Bool `joy` / Trigger `surprised`、クリップ `NpcFaceNeutral/Joy/Surprised`）と、それを NPC アイテムの状態 `npc_joy`（Bool）・信号 `npc_surprised` から動かす CCK の Set Animator Value Gimmick 2 個（§2-4） |
| ボタン | シーン内 `ReportPanelUI/RP_0..RP_10, RPW_0..RPW_7, RP_Done`, `AvatarGateUI/AG_Changed, AG_Yes, AG_No`, `DeviceCheckUI/DC_Force`, `DebriefUI/DB_Ok` | 各ボタンは Item + Interact Item Trigger（Specified Item → 親 SLI の Integer 状態）+ `Scripts/PhantomTouch/Study4Button.js`（ラベル・表示・ON/OFF） |
| 鏡 | `MirrorPanel`（SLI）配下に CCK の `Mirror.prefab` を 2 枚（`Mirror` と `MirrorFront`、どちらも 1.2 × 1.8 m、初期非アクティブ） | `Mirror`: 参加者の左前方 45°・1.3 m、参加者の方を向く。rep=1 の Trial - Start（着替え）と Trial - Greeting（向かい合っての挨拶）の間だけ表示。`MirrorFront`: 正面 1.6 m（中心の高さ 1.1 m）。rep=1 の Trial - PoseCheck の間だけ表示。`MirrorTouch`: 正面 1.0 m（中心の高さ 1.05 m）。毎回の Trial - Touch の間に表示（右後ろに立つ NPC、自分のアバター、顔に触れる NPC の手が映る）。Touch の指示文はこの鏡のすぐ上の「touch」位置に出る。配置は §7、§10 |
| アバター変更の写真 | `AvatarGateUI/AvatarGate/MenuPhoto1`, `MenuPhoto2`（Quad、Unlit/Texture、コライダーなし、初期非アクティブ）。画像は `Assets/_Experiment_/Textures/PhantomTouch/open-menu.png`（1: メニューを開いて「アバター」）と `open-avatar-menu.png`（2: アバター変更画面で「LUIDA Default Avatar」を選び「アバターを変更」）、マテリアルは `Materials/PhantomTouch/MenuPhoto1.mat`, `MenuPhoto2.mat`。画像は 2 の累乗へ縮小せずに取り込む | 着替え指示（AvatarGate）の右隣に上から 1, 2 の順で縦に並べる（幅 0.52 m、縦横比は画像のまま）。AvatarGate が rep=1 の着替えの間だけ表示。2 は Default Avatar を選ぶ写真なので、Default Avatar のブロックでだけ出す（普段使いのブロックでは 1 だけ） |
| 身長合わせ | `HeightPlatform`（Item + `Scripts/PhantomTouch/Study4Platform.js`、立ち位置。子 `Cube` 1.6 × 1 × 1.6 m、コライダー付き）と NPC の子 `Riser`（0.8 × 1 × 0.8 m、コライダーなし） | どちらも高さ 1 m の直方体で、上面が足元（床）にあるので通常は床下に隠れ、持ち上げた分だけ床の上に出る。NPC が `platform_set { h }` で台を上げる。§2-4 |
| その他 | `FloorMarker`（Quad）、`Materials/PhantomTouch/*.mat`、`ExitPortal`（立ち位置に配置）配下に移した `WorldGateToLuidaBar`（ExitPortal から (100, 100, 100) 離れた位置に置き、End の 10 秒後に参加者をそこへテレポートする） | |

レイアウトはスポーン地点 (0,0,-2) を原点、+Z を正面として配置している。NPC は実行時に参加者の頭位置から立ち位置を再計算するので、初期位置は仮。

## 2. ランタイムの流れ（要点）

自己アバター条件（参加者内）は **Default Avatar（assigned）vs 普段使い（daily）**。Web Console の参加者アバターモードは DEFAULT（`luida_default_avatar`）で、このワールドではアバター変更メニューに「LUIDA Default Avatar」が表示される。行データの `avatar` は従来どおり `assigned` / `daily`、実験変数 `order` も `daily_first` / `assigned_first` のまま。

参加者の移動（スティック／キー操作の移動速度）は入室から 0。動けるのは `Trial - Greeting` の間だけ（End では退出ゲートへテレポートするので、歩く必要はない）。NpcDirector の `nd_tick` が 1 秒ごとに `setMoveSpeedRate` を掛け直す（LUIDA のプレイヤースクリプトが参加者の初期化時に 1 へ戻すため）。部屋の中を実際に歩くことは止められない。

1. `Start`: 質問紙なし（同意は募集側で取る）。正面の指示板に、何をするかだけを書いた説明（条件や仮説には触れない）と、その下に「OK」ボタン（Debrief と同じ `DebriefUI/DB_Ok`）。押すと遷移（デバッグ用にステートへ Exit Time を付けてもよい）。NPC は非表示。
2. `Trial - Start`（ブロックの 1 試行目のみ。2026-11-11 以降の「rep」は §11）: NPC に `npc_setup`（マーカーの位置・向き・床の高さを渡す。前のブロックの身長合わせを解除し、足元の台を下げる）を送ってから参加者をマーカー（床の高さ）へテレポートし、NPC を非表示（`npc_hide`）にして AvatarGate が着替え指示（Default Avatar の条件では「メニューのアバター変更に表示される『LUIDA Default Avatar』に着替えてください。左の鏡に着替えたアバターが映るまで待ってから、『着替えました』を押してください」）→「着替えました」→「はい/いいえ」→ 行保存 → 遷移。rep=2 では AvatarGate が即 `ToNextState()`。着替えの間は左前方の鏡（`Mirror`）を出し、アバターの読み込みを鏡で確かめてからボタンを押してもらう。着替えの指示の間、パネルの右隣にアバター変更の手順の写真を出す（1: メニューを開く。2: アバター変更画面。2 は Default Avatar のブロックだけ）。Default Avatar の骨格値（`AG_D_ARM` / `AG_D_SHOULDER`）は未計測なので、現在は自動判定なしで「着替えました」をすぐ出し、二段階の自己申告で進める（行データ `avatarCheckFallback = true`、`avatarIsDefault = null`）。Cluster 上で Default Avatar を着て `[AvatarGate] signature …` のログ値を 2 つの定数（builder の `AvatarGateLegacy`）に入れると、骨格による一致判定（1 秒安定）が有効になる。
3. `Trial - PoseCheck`（rep=1 のみ。rep=2 は DeviceCheck アイテムが即 `ToNextState()`）: 着替えの後、NPC が現れる前に、ブロックごと（アバター条件ごと）にトラッキングとポーズを確認する。正面に鏡（`MirrorFront`）を出し、指示板は「鏡を見ながら、次の動きをしてください。1) 頭をゆっくり左右に向ける 2) 両手を頭より高く上げる」。DeviceCheck（右側の緑のパネル）が、頭を左右 25° 以上回す ＋ 両手を頭より上に 1 秒を判定する。60 秒経過で救済ボタンが出る。合格で行を保存して遷移（行データ `deviceCheckSec`, `deviceCheckForced`。ブロックごとに 1 行）。以前は Start の直後に 1 回だけ行っていた（ステート名 DeviceCheck）。デバッグ時はこのステートに Exit Time（数秒）を付けると自動で進む。本番では付けない。
4. `Trial - Greeting`（2026-11-11 から毎試行 20 秒、その試行の社会的条件で。§11）: 参加者は歩いて移動できる（終了時に再び 0）。NpcDirector が `npc_show` → NPC がまず身長を合わせる: 参加者の頭ボーンの高さ（頭ボーン − 足元）と自分の頭ボーンの高さを比べ、差が 5 cm 以上なら、参加者が低いときは立ち位置の台（`HeightPlatform`）を差の分だけ上げて参加者をその上に乗せ（位置だけテレポート、向きはそのまま）、NPC が低いときは自分の足元の `Riser` に乗る（NPC の移動時は一緒に動く）。着替え直後でボーンが読めないときは最大 3 秒待って再試行し、読めなければ合わせない。次にマーカーの正面方向、会話距離（正面から手が届く位置 + 0.45 m ≈ 1.0 m）に現れる。左前方の鏡が表示される（挨拶は 2026-11-10 以降も向かい合って行う）。指示板は「30 秒間、目の前のアバターを見ながら挨拶してください。（例：手を振る、少し横に動く）」（社会的条件によらず同じ）。行データに `participantHeadH`, `npcHeadH`, `heightPlatform`, `npcLift`（m）。閾値は `NPC_CFG.HEIGHT_MATCH_MIN`。
   - social = with:
     - 視線: 頭（と目）だけで参加者を追う（頭は最大 50°、目はさらに 12°）。参加者が NPC の正面から 35° 以上ずれると体全体が補間（指数的、2.5/s）で向き直り、4° 以内で止まる。体が回るにつれ頭のローカル回転は自然に戻る。
     - 反応: 参加者の視線が NPC に向いた瞬間（30° 以内、45° で解除）と、参加者が手を頭の高さ付近まで上げた瞬間に反応する（2.5 秒のクールダウン）。最初の反応は必ず「頷き＋手振り＋笑顔」。以降、視線への反応は頷きのみ／手振りのみ／両方をランダム、挙手への反応は手振り（頷きは 50%）。笑顔（`Fcl_EYE_Joy`=100, `Fcl_MTH_Joy`=50）は 50% の確率で付き、反応の終了とともに戻る。
     - 無反応が続くとき: 反応が 5 秒間（`IDLE_REACT_SEC`）なければ、頷き＋笑顔（手振りなし）を 1 回する。静かなままなら 5 秒ごとに繰り返す。この頷きは「最初の反応」にもクールダウンにも数えないので、直後の挨拶にはすぐ反応する。回数は `greetNpcIdleReactions`。
     - 触られたとき: 参加者の手が NPC の頭・胴・腕に触れた瞬間に驚き顔（`Fcl_EYE_Surprised`=50, `Fcl_MTH_Surprised`=50）を 1 秒（1.5 秒のクールダウン）。
     - 表情は顔メッシュ `Model/Face` の Animator（`NpcFace.controller`: Bool `joy`、Trigger `surprised`）で切り替える。Cluster Script からはブレンドシェイプを直接書けない（`unityProp` で触れる SkinnedMeshRenderer のプロパティに重みは無い）ので、クリップで動かす。Animator のパラメータは、同じオブジェクトに付けた CCK の Set Animator Value Gimmick 2 個（NPC アイテムの状態 `npc_joy`（Bool）→ `joy`、信号 `npc_surprised` → `surprised`）が書き、スクリプトは `$.setStateCompat('this', 'npc_joy', …)` / `$.sendSignalCompat('this', 'npc_surprised')` を呼ぶだけ（LUIDA の「Show item」と同じ仕組みで、エディタのプレビューでも Cluster でも動く）。以前はスクリプトが `getUnityComponent('Animator').setBool` を直接呼んでいたが、NPC のモデルをシーン上で差し替えたあと新しいモデルには Animator が無く、表情が出なかった。keep-scene メニューと `LUIDA > Study4 > Rebuild NPC face animator` は、シーン上の NPC の今のモデルから 4 つのシェイプキーを持つメッシュを探して Animator とギミックを付け直す。
   - social = without: NPC は立っているだけ（注視も反応もなし）。
   - 期間終了時に `greetSec / greetGazeEvents / greetHandRaises / greetNpcReactions / greetNpcNods / greetNpcWaves / greetNpcSmiles / greetNpcIdleReactions / greetTouches` を収集データへ書き込む（同じブロックの 2 試行目の行にも残る）。これらの列は 2026-11-08 まで Data Collector の列一覧に入っておらず行に出ていなかった（同日に追加）。
5. `Trial - Touch`（2026-11-10 から配置を変更。§10。鏡・接触点・撫でる速度は同日の追加調整で更新、数値は §10 が最新）: 正面の近い鏡（`MirrorTouch`）を出し、左前方の鏡は隠す。指示板は「後ろの相手の手がゆっくり顔に近づきます。顔を正面に向けたまま、楽な姿勢で鏡を見ていてください。」。NpcDirector が `npc_trial_start`（`reset: true`）を送信。NPC は挨拶の位置（正面）から消え、参加者の位置と向きをマーカー（初期位置。台があればその上）へ戻し、1 秒待ってから（テレポートの反映待ち）、参加者の右後ろ（マーカーの向きから右へ 125°、`TOUCH_STAND_AZ_DEG`）の会話距離に現れ、0.5 秒後に 1 秒で同じ線上の手の届く位置（マーカーから約 0.4 m）へ前進する。体はマーカーの向きから左へ 30°（`TOUCH_BODY_YAW_DEG`）、つまりほぼ鏡の方を向き、少し参加者の方へ向く。prep(2 s, with 条件は注視＋会釈/手振り。手振りは外側の右手で、鏡に映る) → ready(1.2 s で手を参加者の顔の右横へ上げ、指を曲げ始める。接触点が目標から参加者の右へ 30 cm・前へ 5 cm（`APPROACH_SIDE` / `APPROACH_FWD`）。指は顔の前を横切る向き（参加者の左へ、前へ 30°・上へ 10°。`HAND_ACROSS_YAW_DEG` / `HAND_ACROSS_TILT_DEG`）、手のひらは頬の方、親指は上) → approach(横からの直線に沿って 2 cm/s で、曲げた指の接触点が目標の 2 cm 手前（`STOP_MARGIN`）に来るまで。経路 0.28 m、約 14 秒) → stroke(撫でる: 接触点を顔に沿って真下へ 6 cm（2 cm/s）→ 手のひらの法線に沿って顔から 3 cm 引く → 引いたまま上へ戻る → 再び触れる、を 3 回。戻りの 3 区間は 4 cm/s。計 15 秒。手の向きは接近時のまま) → hold(最後の撫で終わりの位置で 1 s) → retract(接近した直線を 10 cm/s で ready の位置まで戻る。参加者の頭や肩を横切らない) → lower(1.2 s で腕を下ろし、指を伸ばす) → 会話距離（右後ろ）へ後退してから消える。目標点は参加者の右頬: Head ボーンの 2 cm 上、参加者から見て右へ 4 cm、前へ 9 cm（`FACE_UP`, `FACE_SIDE`, `FACE_FWD`）。本番（LUIDA の `isTestMode` が false。NpcDirector が `npc_setup { eyes }` で伝える）では目ボーンの中点の 4.5 cm 下（`CHEEK_BELOW_EYES`）を使う。エディタのエミュレータは目ボーンの無いアバターで `getHumanoidBonePosition` が null を返さず .NET 例外を投げ、JS の try/catch では受けられずハンドラ全体が止まる（2026-11-08 に NPC が出なくなった原因）ので、テストモードでは目ボーンを読まない（以前は Head ボーンの 5 cm 上＝目のすぐ下で、高すぎた）。撫で方は `STROKE_AMP` / `STROKE_BACK` / `STROKE_CYCLES` / `STROKE_RETURN_SPEED`（`STROKE_CYCLES` 0 で撫でない）。行データに `strokeEndTs`, `strokeAmp`, `strokeBack`, `strokeCycles`, `strokeReturnSpeed`（撫で始め = `contactTs`）と、そのときの `heightPlatform`, `npcLift`。消えた後に `npc_done`（Item 信号 → GlobalLogic → Global 信号）→ NpcDirector が遷移するので、報告パネルや質問紙の間 NPC はいない。各ブロックの 2 試行目も同じく、消えていた NPC が参加者を戻してから 1 秒後に右後ろの会話距離に現れ、0.5 秒後に前進する。120 秒の安全タイムアウトあり（このときも NPC は後退して消える）。鏡はこのステートの終了で非表示。
6. `Trial - Report`: 0–10 → （評定≥1 のみ）感覚の種類（複数）→ 部位（複数）→ 操作チェック 1–7（相手に注意を向けられたと感じたか。2026-11-08 から最後に回した）→ 行保存 → 遷移。数字は `RP_*`（4 × 3）、種類と部位は幅の広い `RPW_*`（2 × 4）に出す。
   - 種類（`ptype`）: 1 触れられた感じ（Touch）/ 2 圧迫感（Pressure）/ 3 温かさ / 4 冷たさ / 5 ピリピリ・チクチク・しびれ（Tingling）/ 6 くすぐったさ・かゆみ / 7 風が通る感じ / 8 その他。
   - 部位（`ploc`）: 1 額 / 2 目・目のまわり / 3 頬 / 4 鼻・鼻のまわり / 5 唇・口のまわり / 6 あご / 7 頭の側面・耳 / 8 その他。場所が分からない人は「その他」を選ぶ想定。
   - 値は選んだ番号を昇順に `,` でつないだ文字列（例 `1,5`）。評定 0 の行は空。2026-11-08 に選択肢を入れ替えたので、それより前のテストデータとは番号の意味が違う。
   - 「その他」を含めて「決定」を押すと、Cluster の文字入力（`requestTextInput`）が開く。入力した文字列は改行を空白に置き換えて `ptypeOther` / `plocOther` に入る。入力を閉じるか、1.5 秒以上たってからもう一度「決定」を押すと、空のまま次へ進む。入力できない状態（Busy）なら 2 秒ごとに最大 5 回まで開き直す。
7. `Trial - VEQ`: NpcDirector が試行のブロック内の位置を見て、各ブロックの最後の試行以外は即 `ToNextState()`。該当時は質問紙の上に「あなたがいま使っているアバター（問題文では「仮想身体」と表現されていることがあります）について伺います。」（3 行）を出し（相手のアバターではなく、参加者自身のアバターについて聞いていることをはっきりさせる）、質問紙（VEQ, qID 2）の完了で遷移（NPC は触る段階の終わりに消えている）。ブロック 1・2 の回答は同じ qID に保存されるので、時刻順で区別する。
8. `SocialPresence`（2026-11-11 から毎試行、Trial - Report の直後。§11）(qID 3、質問紙の上に「あなたの顔に触れてきた相手についてのアンケートです。」) → `PersonalExperience`(qID 4、「最後のアンケートです。」) → `Debrief`: 正面の指示板にデブリーフ文（感謝 → 調べていたこと: ファントムセンス（VR感覚・V感）のうち、誰かに触れられたと感じるファントムタッチ錯覚が、相手の反応や自分のアバターに影響されるか → その錯覚の説明 → 条件（相手の社会的な反応の有無 × 普段使いのアバターかどうか）→「【お願い】」に続けて、今月中は内容と条件を他言しないお願い → OK の案内。13 行、文字 0.022）、その下に「OK」ボタン（`DebriefUI/DB_Ok`、Instruction アイテムの Integer 状態 `ins_btn` に書く）。押すと `End` へ。
9. `End`: データを 1 回アップロード。指示板に「あと N 秒で募集ワールドへ移動します」（10 秒のカウントダウン）を出し、0 になった時点で ExitPortal が退出ゲート（CCK World Gate）を有効にして、参加者をそのゲートへテレポートする。ゲートはスポーン地点から遠い位置（ExitPortal のローカル座標 (100, 100, 100)）にあり、ParticipantManager が参加拒否のときに使う方式と同じ。World Gate は触れた瞬間に移動させるので、カウントダウンの後に有効にしている（秒数は builder の `EndGateDelaySec`）。以前は参加者の足元に出していたが、それだとゲートがスポーン地点に残り、同じスペースに次に入った人がすぐ送り返されていた。参加者が退室した後の流れは §8。

## 3. 残作業・確認事項（優先順）

1. Web Console（手動）: 実験作成（定員 1、Allowed platforms = VR、Participant Avatar = DEFAULT）、質問紙 qID 1–4（Start の同意、VEQ、SocialPresence、PersonalExperience）をこの順に登録、実験 ID を `LUIDA > Configure experiment identifiers` に設定、ワールド ID 登録。
2. テスト（設計書 §16）: T2（Default Avatar の骨格値 `AG_D_ARM`/`AG_D_SHOULDER` を実測して設定。未設定の間は自己申告のみ）、T3、T4（2 cm/s・停止位置・身長差）、T5、T6、T7（Custom Log 7 行・100 kB 未満）、T8、T10。
3. 文言・レイアウト調整: 文言は `Study4SceneBuilder.cs` の `InstructionListeners` と各 Legacy code（`AvatarGateLegacy`, `DeviceCheckLegacy`, `ReportPanelLegacy`）、配置・文字サイズ・背景色は §3b の定数と `ApplyLayout`（§7）。変更後はメニュー `LUIDA > Study4 > Update layout and behaviours (keep scene)`（UI の配置のほか、`HeightPlatform` と NPC の `Riser` が無ければ作り、`Trial - Greeting` の Exit Time を builder の `GreetingSeconds` に合わせ、アイテムの動作と JS を書き直す）。NPC の距離・反応の閾値は `NpcController.js` 冒頭の `NPC_CFG`（`IDLE_EXTRA_DIST`, `LOOK_AT_DEG`, `HAND_RAISE_OFFSET`, `JOY_PROB`, `IDLE_REACT_SEC`, `HEIGHT_MATCH_MIN`、目標点の `CHEEK_BELOW_EYES` / `FACE_SIDE` / `FACE_FWD`、触る段階の立ち位置 `TOUCH_STAND_AZ_DEG` / `TOUCH_BODY_YAW_DEG` / `TOUCH_MIN_STAND_DIST`、接近の始点 `APPROACH_SIDE` / `APPROACH_FWD` / `APPROACH_UP`、手の向き `HAND_ACROSS_YAW_DEG` / `HAND_ACROSS_TILT_DEG`、指の曲げ `FINGER_CURL`、撫で方の `STROKE_*` など）。
4. 既知の軽微な点: ボタンは Study4Button.js の `btn_cfg` を受け取るまで非表示。ReportPanel はボタンへのメッセージを 1 フレーム 4 件ずつに分けて送る（ワールドアイテムの `send` の上限はスペース全体で 3000 回/秒なので余裕はある。数字から語の選択肢に切り替えるときで 20 件）。

## 4. 再生成

`LUIDA > Study4 > Build PhantomTouch scene` を実行すると、PhantomTouch 用の生成物（シーン、Settings、Scripts/StateManagement/PhantomTouch、Avatars/PhantomTouch、Prefabs/PhantomTouch）を削除してから作り直す。手で加えた変更は失われるので、恒久的な変更は `Study4SceneBuilder.cs` 側に反映すること。

## 5. NPC の腕の姿勢（手のひらの向き）

各腕ボーンの回転は「骨の向き」と「ひねりの基準」の 2 つで決める（`NpcController.js` の `basisRot` / `armRots`）。T ポーズ（VRM 規約: 手のひら下向き、肘は前方へ曲がる）を基準に、上腕は肘の曲がる向き、前腕と手は手のひらの法線を合わせる。

| 場面 | 手のひらの向き | 指の向き |
|---|---|---|
| 待機 | 体側（太もも側） | 下 |
| 手を振る（挨拶では左手、触る段階の prep では外側の右手） | 正面 | 上（左右に振る） |
| 頬に触れる（右手、2026-11-10 から） | 参加者の右頬の方（後ろ左向き、水平） | 顔の前を横切って参加者の左へ。前へ 30°、上へ 10°（`HAND_ACROSS_YAW_DEG` / `HAND_ACROSS_TILT_DEG`）。親指は上 |

2026-11-10 までの正面からの接近（指は水平から 45° 上、`HAND_PITCH_DEG`）は、挨拶の距離を決める計算にだけ残している（`greetStandPose`）。

指（右手のみ）: ready で曲げ始め、approach・stroke・hold・retract の間は `FINGER_CURL` の角度、lower で伸ばす。それ以外は真っすぐ。曲げは各関節を手のひら側へ回す（人差し指 5/15/10°、中指 25/35/20°、薬指 35/45/25°、小指 45/50/30°、親指 0/10/10°。参考画像のように人差し指はほぼ伸ばし、ほかは順に強く曲げる）。指ボーンが無いボーンマップでは指は動かず、接触点は従来の値（手首から指方向 12 cm（`CONTACT_LEN`）、手のひら側へ 1.5 cm（`PALM_OFF`））。

接触点（`STOP_MARGIN` と距離 `d` の基準）: 指の方向には中指の先、手のひらの法線方向には曲げた指のうちいちばん手のひら側に出た点 + 指の腹の厚さ 8 mm（`FINGER_PAD`）。手のどこも、この点より顔に近づかない。起動時に休止姿勢の指ボーンの位置から計算してログに出す（`[NPC] fingers: 5 curled, contact a=0.109 b=0.054 c=0.002`: 手首から指方向 10.9 cm、手のひら側 5.4 cm、親指側 0.2 cm）。

## 6. 修正履歴: テキストやボタンが表示されない不具合（2026-11-04）

- **症状**: デバイスチェックの後に着替えボタンが出ないことがある。DeviceCheck・AvatarGate のテキストと、試行内報告（0〜10 評定）の問題文が表示されない。
- **原因**: LUIDA のステート連動アイテムは、ルートの Set Game Object Active Gimmick（`exp_showItem`）によって、`Show item` を一度も呼ばない限り非アクティブのままになる。指示板（Instruction）以外のアイテムは `Show item` を呼んでいなかったため、子のテキスト、鏡（MirrorPanel）、退出ゲート（ExitPortal）が描画されなかった。ボタンは別アイテムなので表示されていた。着替えの指示文が見えないため、普段使い条件では「着替えないとボタンが出ない」状態に気づけなかった。
- **修正**: すべてのステート連動アイテム（NpcDirector, AvatarGate, DeviceCheck, ReportPanel, MirrorPanel, ExitPortal）で、Start ステートの最初に `Show item` を実行する。
- **保険**: AvatarGate は、骨格による自動判定が 30 秒以内に一致しない場合でも「着替えました」ボタンを出し、二段階の自己申告で進める（`AG_FALLBACK_SEC`、0 で無効）。このとき行データに `avatarCheckFallback = true` を記録する。計測した骨格値（腕長・肩幅・頭高）を 5 秒ごとに `[AvatarGate] signature …` としてログに出すので、Cluster 上での透明アバターの実測値を確認して `AG_T_ARM` / `AG_T_SHOULDER` を更新できる。
- **反映方法**: メニュー `LUIDA > Study4 > Update item behaviours (keep scene)`。builder の定義からアイテムの動作（リスナー、イベント、Legacy コード）と Data Collector スクリプトを書き直して結合する。シーンのオブジェクトには触れない。ただし GUI でアイテムの動作を手で変えていた場合は上書きされる。

## 7. UI レイアウト（2026-11-04）

参加者の立ち位置（スポーン、目の高さ 1.55 m）から見た方位角（正面 0°、右が +）と仰角で配置する。同時に表示されるものどうしが重ならないようにしてある（エディタ上で各メッシュの角度範囲を計算して確認）。

| 表示されるステート | 物 | 方位角 / 仰角 / 距離 |
|---|---|---|
| VEQ, SocialPresence, PersonalExperience | 質問紙（LUIDA） | ±34° / −25〜+23° / 2 m |
| 同上 | 指示板「above」位置（質問紙の上端から 0.05 m 上、文字 0.03。2026-11-08 に 0.2 m 下げた） | ±23° / +28〜+33°（2 行時） / 1.7 m |
| Start, Debrief, End | 指示板「center」位置（正面）と OK ボタン（Start・Debrief、その下） | デブリーフ（13 行、文字 0.022）±22° / −11〜+18°、ボタン −17° / 1.5 m |
| 上記以外 | 指示板「front」位置（挨拶では NPC の頭の上、触る段階では正面の鏡の上） | ±14° / +17〜+28°（4 行時） / 1.5 m |
| Trial - Start | AvatarGate（紫、正面。NPC は非表示） | ±20° / −22〜+4° / 1.25 m |
| Trial - Start | アバター変更の写真 1・2（AvatarGate の右隣、上から順に） | +22〜+45° / −25〜+3° / 1.25 m |
| Trial - PoseCheck | DeviceCheck（緑） | +27〜+53° / −16〜−2° / 1.25 m |
| Trial - PoseCheck（rep=1） | 正面の鏡（`MirrorFront`。上端は front 位置の 3 行の文字の下端 +19° より下。文字より奥にあるので文字を隠さない） | ±21° / −40〜+16° / 1.6 m |
| Trial - Touch | 近い鏡（`MirrorTouch`）と、その上の指示板「touch」位置（鏡の面の 3 cm 手前、文字 0.0155） | 鏡 ±31° / −42〜+22° / 1.0 m、指示文 ±17° / +24〜+32° / 0.97 m |
| Trial - Report | ReportPanel（茶、正面。NPC は非表示） | ±19° / −32〜+5° / 1.25 m |
| Trial - Start, Trial - Greeting（いずれも rep=1） | 左前方の鏡（`Mirror`） | −20〜−70° / −41〜+21° / 1.3 m |

- **文字**: CCK の TextView では全角 1 文字の幅が size × 1.85、行の高さが size × 2.74（実測）。指示板 0.024（1.5 m で 1 文字約 1.7°）、パネル 0.018（1.25 m で約 1.5°）。1 行の長さは場所ごとの空きに合わせた（全角換算）: front（NPC の頭上、隣に鏡）20 字、above（質問紙の上）26 字、center 26 字（デブリーフは 30 字）、AvatarGate と ReportPanel（正面）24 字。パネルの文字は下端を基準に上へ伸びるので、行数が増えてもボタンに重ならない。
- **背景**: 文字ごとに半透明の色板（Standard / Fade、文字より先に描画する render queue 2990、コライダーなし）。指示板は紺、AvatarGate は紫、DeviceCheck は緑、ReportPanel は茶。背景は各 `Text` の子なので、文字と一緒に表示・非表示になる。指示板の背景は 1 枚（`Bg`）で、`ins_show` が行数と最長行の文字数から大きさを計算し、`getUnityComponent('Transform').unityProp.localScale` で合わせる。
- **指示板の移動**: Instruction アイテムは立ち位置に置き、`ins_show(slot, text, size?)` が `Text` サブノードを front（NPC の頭上）/ above（質問紙の上）/ center（正面）に移し、文字サイズも切り替える（`SubNode.setPosition/setRotation/setTextSize`）。Start は center に課題の説明だけ（条件・仮説なし）と OK ボタン。質問紙のあるステートの文言: VEQ「あなたがいま使っているアバター（問題文では「仮想身体」と表現されていることがあります）について伺います。」、SocialPresence「あなたの顔に触れてきた相手についてのアンケートです。」、PersonalExperience「最後のアンケートです。」。
- **ボタン**: 報告パネルの数字は 4 列 × 3 行（0〜10 を左上から順に、0.16 × 0.10 m）。種類と部位は別の 2 列 × 4 行のボタン（0.38 × 0.115 m、上端は数字の格子と同じ高さ）で、ラベルは問題文と同じ 0.018（1 行全角 10 字まで、2 行まで）。その下に「決定」。ラベルの文字サイズは `Study4Button.js` がボタンに収まるように決める（`btn_cfg` の `fit`）。AvatarGate の「着替えました」と「はい/いいえ」は別の行（連打で確認を飛ばさないように）。
- **NPC と質問紙**: 会話距離の NPC は質問紙の手前に立ってしまうので、毎回の触る段階の終わりに元の位置へ戻ってから消える（§2-5）。
- **反映方法**: メニュー `LUIDA > Study4 > Update layout and behaviours (keep scene)`。上記の 5 つのルート（Instruction, AvatarGateUI, DeviceCheckUI, ReportPanelUI, MirrorPanel）の配置・文字サイズ・背景だけを変え、続けてアイテムの動作を書き直す。ステートリストなど他の設定には触れない。フルビルドも同じ `ApplyLayout` を使う。
- **ステートの並べ替え（2026-11-08）**: メニュー `LUIDA > Study4 > Move the pose check into the trials (keep scene)` が、ステートリストの DeviceCheck を `Trial - PoseCheck` に改名して `Trial - Start` の直後へ移し、実験変数 JS の `state_names` と既存のステートオブジェクト（並び順、各 Transition のステート ID・遷移先・Exit Time、Trial - Rest の戻り先）を合わせてから、上のメニューと同じ更新を行う。LUIDA の State Machine タブの再生成は質問紙フォームも作り直すので使わない。2 回目以降の実行では並べ替えずに ID だけ合わせ直す。

## 8. セッションリセット: 新しく入った人に確認してから（2026-11-08。2026-11-07 の End 後の自動リセットを置き換え）

セッションが使われているインスタンス（Start 以降。End 到達後も途中離脱後も）に、登録済みの参加者が誰もいない状態で未登録の人が入ると、LUIDA の ParticipantManager（PM）がその人に確認してからワールドを初期状態に戻す。設計と確認した事実は `session-reset-prompt-plan.md`（前の自動リセットの設計は `session-reset-plan.md`）。送信成功の確認と再送は範囲外のまま（`upload-reliability-plan.md`）。

- **いつ・どう出すか**: PM が 1 秒ごとに在室者を見る。登録済みの参加者が誰も残っていない（`exists()` が false で、同じ入室 id の人もいない）かつ未登録の人がいると、3 秒後にその人の正面 0.5 m・頭の高さに小さな赤いパネル（PM プレハブの `NewParticipantPrompt`。0.7 × 0.4 m、白い文字 size 0.015）を出す。文言は「中断または終了したセッションに入ったようです。「OK」を押して実験を最初から始めてください。」と英文（`NR_TEXT_ASK`）。その下にオレンジの「OK」。（大きさ・位置・文言は 2026-11-09 にユーザが LUIDA-ExpManagers のオーバーライドで決めた値。PM プレハブ本体とコードもこれに合わせた）相手が 1 m 以上離れたら置き直す。押されるまで何も変えない。相手が去ればパネルは消え、次に入った人にまた出す。（2026-11-09: 1.2 m 先の「あなたは新しく入った参加者ですか？」「はい」から変更）
- **「OK」**（PM の `$.onInteract`）: 自アイテム信号 `exp_sessionReset` → PM プレハブの GlobalLogic 5 個が Global を戻す（`state_exited`、`state_currentID = 0`、`exp_trialID = 0`、`exp_readyToLeaveTrials = false`、`exp_arePlayersEnough = false`）。同時に ConditionManager（CM）へ `luida_reset`。Global の 4 値と CM の返信 `luida_reset_ack` を確認してから PM 自身を `initSession()` で戻す（新しい sessionID、最後に登録再開）。確認できなければ 2 秒ごとに再送し、15 秒でパネルに「エラー：実験の初期化に失敗しました。実験者にご連絡ください。」（英文付き）。進まない。以降は 1 人目と同じ流れ（登録 → eligibility → Start）。
- **「続きから / Resume」**（`LUIDA-ExpManagers` 配下の別アイテム `NewParticipantPromptNo`。「OK」の下、0.3 × 0.05 m。パネルと同じ赤の帯 0.7 × 0.05 m を一緒に出してパネルを下に伸ばす）: 登録済みの参加者と同じアカウント（idfc）で入り直した人にだけ出す。そのときの文言は「中断したセッションに戻ってきたようです。「OK」で最初から、「続きから」で再開します。」（`NR_TEXT_ASK_RESUME`）。押すと、その人を前の参加者の枠に結び直す（PM グループと CM グループの `participants`、PlayerScript、各質問紙の `participant`）。リセットしない。位置はスポーン地点のまま、開いていた質問紙は閉じて最初から、Touch の途中なら NPC は止まっていて 120 秒で先に進む。
- **捨てるもの**: 途中離脱した人の未送信行（DataCollector が CM グループの sessionID の変化で捨てる）と、CM グループの寄せ集め値 `collectedData`（CM が `luida_participants_info` で sessionID が変わったときに空にする。途中ステートの exit アクションより後なので競合しない）。
- **途中ステートからのリセットで残るもの**: Exit Time のタイマーは `state_isActive` を見てから遷移するので残っても無害。`ToNextState()` も `state_isActive` で無効（直前 0.2 秒のものだけ例外）。during アクションは Start が来るまで動くが表示の更新だけ。NPC と鏡は Start で隠す（下記）。
- **LUIDA 本体の変更**: `ParticipantManager.js`（`nr_*`、`luida_prompt_no` / `luida_reset_ack` の受信、`participantIdfcs`。文言は `NR_TEXT_*`）、新規 `NewParticipantPromptNo.js`、`ConditionManager.js`（返信、`collectedData`、`luida_rebind_participant`）、`CustomDataUploader.js`（未送信行の破棄）、`FormController.js`（結び直し）。プレハブ: `ParticipantManager.prefab` にパネル（`NewParticipantPrompt` / `NewParticipantPromptBack` / `NewParticipantPromptText` / `NewParticipantPromptOk`。初期非アクティブ、既定位置はローカル (0, 1.4, 1.2)）と GlobalLogic 5 個、`LUIDA-ExpManagers.prefab` に `NewParticipantPromptNo`（Item + MovableItem + ScriptableItem）と PM の参照、マテリアル `NewParticipantPromptPanel`（赤）/ `NewParticipantPromptButton`（オレンジ）。組み込みは `research/study4-phantom-touch/tools/InstallNewParticipantPrompt.cs`（Unity MCP の `execute_code` で実行。冪等。大きさ・色・文言の初期値もここ）。プレハブのサブノードが無い既存ワールドでは何も起きない。
- **シーン側（2026-11-08）**: 旧 `SessionReset` アイテム（自動リセット）と生成物、builder の設置メニューを削除。残すと End 後に自動でリセットしてしまう。NpcDirector の Start で `npc_hide`（NPC を隠し、台も下げる）、MirrorPanel の Start で両方の鏡を隠す。NpcController の `participant()` は登録参加者が退室済みなら傍観者に切り替えない。Instruction の End 文言から旧 `luida_resetStatus` の分岐を削除（前の参加者がいなければ「しばらくお待ちください…」）。
- **確認**: プレハブモードで `NewParticipantPrompt` をアクティブにして文字の大きさと向きを見る（WaitingMessage と同じ向き。逆なら PM.js の `nr_place` で 180° 回す）。モックテスト `node --test "research/study4-phantom-touch/tests/*.test.mjs"`（`session-reset-prompt.test.mjs` が確認・リセット・結び直し・破棄を扱う）。実機テストは計画 §6.3（R1〜R8。同じアカウントの入り直し、途中離脱、押さずに退室、実験者の入室、不達）。
- **既知の制約**: 送信の成功は確認しない。空のスペースの存続時間と振り分けは Cluster 次第。保存した PlayerHandle の `id` / `exists()` が再開後も使えることを前提にしている（使えなければ「誰か入れば必ず聞く」側に倒れる）。

## 9. 質問紙は「ステートの訪問ごとに 1 回」答えられる（2026-11-08）

- 以前は `FormController.js` が送信後に `isSubmitted` を立てたまま戻さず、同じ質問紙オブジェクトは二度と開けなかった（待機画面でクリックすると質問紙が読み直される不具合への対処）。Study 4 の VEQ（qID 2）のように同じ質問紙を複数回使う実験では使えないので、制限を「同じステートの訪問につき 1 回」に変えた。
- 仕組み: 送信時に Global 信号 `state_entered` の時刻を控える。`$.onUpdate` で、その時刻が変わった（ステートマシンが次のステートに入った）ときだけ `reopenForm()` で閉じた状態に戻し、開始ヒントを再表示、待機文を消す。応答待ちの間は `state_entered` が変わらないのでクリックしても何も起きない（以前の不具合は再発しない）。コンテナはステート終了（`state_exited` → `state_isActive = false`）で非表示になるので、戻した瞬間に参加者が触れることはなく、次に同じステートに入ったとき開ける状態になっている。
- 送信の応答が返らない（通信失敗）場合は、以前と同じくそのステートに留まり、質問紙も閉じたまま。送信の確認・再送は `upload-reliability-plan.md` の範囲。
- モックテスト: `luida-reset-handlers.test.mjs` の「answered once per state visit」。

## 10. 触る段階の配置: 正面の鏡、右後ろから右頬へ、指を曲げる（2026-11-10）

参考: `phantom-touch-exp-references/`（実験者が参加者の右後ろに立ち、右手を参加者の右側から顔の前へ回して右目〜頬に触れる。参加者は正面の鏡で両者のアバターと触れられている自分を見る。一人称の画像では手は右から入り、人差し指を左へ伸ばし、ほかの指を曲げ、手のひらは顔の方、親指は上）。

- **挨拶は従来どおり**: Trial - Greeting は向かい合って行い、左前方の鏡を出す。Trial - Touch に入った瞬間に NPC は正面から消え、参加者をマーカーへ戻したあと右後ろに現れる（§2-5）。
- **鏡**: Trial - Touch の間は正面の鏡（`MirrorFront`）、左前方の鏡は rep=1 の Trial - Start と Trial - Greeting だけ（`MirrorPanelListeners`）。正面の鏡は指示板「front」位置の文字（1.5 m）より奥（1.6 m）で、上端（+16°）は 3 行の文字の下端（+19°）より下なので、文字を隠さない（エディタのプレイで参加者の目の位置から確認）。
- **立ち位置**: `standPose` を挨拶用（`greetStandPose`、従来の計算そのまま）と触る段階用（`touchStandPose`）に分けた。触る段階では、方位 125° の線上で、右手首が接近の終点（接触点が右頬の 2 cm 手前、横向きの手）に `(上腕 + 前腕) × 0.93` で届くいちばん遠い距離を二分法で求める（最小 0.30 m）。エディタの透明アバター（頭ボーン 1.494 m、NPC は 6 cm のライザー）では 0.40 m、会話距離は 0.85 m。
- **接近**: 参加者の頭の向き（水平）を基準に、目標から右へ 30 cm・前へ 5 cm の点から目標へ向かう直線。経路 0.284 m、14.2 秒（従来の正面からは約 16 秒）。手は頭の真横から近づくので、HMD の視野にはほぼ最後の数 cm で入り、それまでは鏡で見える。撫でる途中で顔から引く向きは、接近方向ではなく手のひらの法線の逆。retract は接近の直線を戻ってから腕を下ろす（関節角の補間だけだと手が参加者の肩を横切るため）。
- **指**: §5。指ボーンを動かすにはボーンマップに指ボーンが要る（下記）。
- **ボーンマップの作り直し**: 従来の `NPC_BoneMap.js` は YoungAvatar.vrm から作られ、休止姿勢の回転がすべて単位回転だった。シーンの NPC は `luida_default_avatar_02.vrm` に差し替えられており、こちらは胸 −7°、UpperChest −19.4°（x 軸）、肩 ∓8.1°（z 軸）、目 ±21.8°（y 軸）など単位回転でない。UpperChest はボーンマップに無いので、その休止回転（胸に対して −12.4°）が腕全体に掛かり、描画された手首は IK の手首から **9.4 cm** ずれていた（エディタで接触時に計測。`[NPC] contact: … wristErr=`）。新しいメニュー `LUIDA > Study4 > Regenerate NPC bone map from the scene model`（`WriteNpcBoneMap`）が、シーンの NPC の今のモデルから、胴・腕・脚・目（従来の 19 本）と右手の指 15 本の休止回転・親の休止回転を取り、BONE_PARENT を「いちばん近い一覧内の祖先」にして書き出す。作り直した後のずれは 1〜3 mm（social 条件では体の前傾と呼吸の分で 7 mm）。NPC の姿勢全体（背骨の反り、肩、目の向き）もモデル本来の休止姿勢に合うようになった。フルビルド（`BuildNpc`）も同じ関数を使う。NPC のモデルを差し替えたら、このメニューを実行し直すこと。
- **NPC プレハブとの関係**: `NPC.prefab` のモデルは YoungAvatar のままで、シーンのインスタンスだけが `luida_default_avatar_02.vrm`。ボーンマップのファイルは両者で共有されるので、シーンのモデルに合わせると、プレハブ単体（シーン外で使う場合）とは合わない。
- **行データ**: `npcStandAz`（触る段階の立ち位置の方位、°）、`touchSide`（`right`）、`fingerCurl`（例 `T0-10-10 I5-15-10 M25-35-20 R35-45-25 L45-50-30`、指ボーンが無ければ `none`）を追加。`handStart` は接近開始時の接触点（曲げた指の腹）。
- **後ずさりの推定の符号を修正**: `retreatDist` / `retreatOnsetDist` は、手が近づく向き（手 → 顔、水平）に頭が動いた量を「手から離れる」として数えるべきところ、逆向き（手の方へ近づく量）を数えていた。2026-11-10 から `away = +dot(delta, axis)`。それより前の行のこの 2 列は、手の方へ動いた量として読む必要がある。
- **視線の判定**: 触る段階の `lookedAtNpc`（prep と approach で参加者が NPC を見たか）は、NPC の頭を直接見たときだけ数える。NPC は後ろにいるので、振り返らない限り false になり、with 条件では prep の終わりに NPC が必ず一度挨拶する（従来、参加者が見ていなかった場合と同じ動き）。鏡に映った NPC を見たことは数えない（鏡の中の NPC は参加者自身の像から約 8° しか離れず、頭の向きでは区別できないため）。
- **確認方法（エディタ）**: プレイ中に、LUIDA のステートは任意のステート連動アイテムの Item 信号 `state_triggerTransition` で 1 つ進められる（CCK の `Bootstrap.RoomStateRepository` と `GimmickManager.OnStateUpdated`）。エディタの参加者は透明アバターなので、見た目の確認には同じ位置に別の VRM を置いた。
- **同日の追加調整（2 回目）**:
  - **撫でる速度**: 撫でる動作の各区間（下へ撫でる・引く・上へ戻る・再び触れる）を、静止から 0.4 秒で加速 → 一定速度 → 0.4 秒で減速して静止、にした（`STROKE_RAMP_SEC`。0 で従来の等速）。一定速度は従来どおり下向き 2 cm/s、戻り 4 cm/s。その分だけ時間が延び、撫でる時間は計 15 秒 → 18.6 秒（下向き 1 回 3.4 秒）。行データに `strokeRampSec` を追加。接近（2 cm/s の等速）は変えていない。
  - **試行中の鏡を 1.3 m・小さめに（2026-11-11）**: HMD 単機（Quest）では、Cluster の鏡に 2 つの制限がある（CCK の `Mirror.cs`、`CLUSTER_QUEST`）。(1) 目と鏡の面の距離が `stereoConvergence × 0.1`（Unity の既定値 10 なら 1 m）より近いと、アバターだけを描く軽量モードになり、NPC（アイテム）や部屋が映らない。1.0 m の鏡では目が 1 m 以内に入っていたので、これが原因。(2) 鏡のテクスチャは鏡全体で最大 768 × 768 なので、大きい鏡ほど粗い。そこで `MirrorTouch` を 1.3 m（前に一歩出たり前かがみになっても 1 m を切らない）、0.9 × 0.95 m（下端 0.8 m・上端 1.75 m。足元から頭の上まで映る）にした。1 度あたりの画素は約 10 → 19（Quest 2 の画面とほぼ同じ）。鏡の像までの距離は 2.6 m になる（1.0 m のときは 2.0 m）。指示文の「touch」位置は鏡に合わせて自動で動く（文字 0.0203、高さ 1.89 m）。左前方とポーズ確認の鏡（1.2 × 1.8 m、1.3 m と 1.6 m）は変えていないので、Quest では同じように粗い。stereoConvergence の値は Cluster アプリ側の設定で、実機では未確認。
  - **右斜め前から接近、終点を少し顔に近く（2026-11-11）**: 接近の始点を、目標から参加者の右へ 24.6 cm・前へ 17.2 cm・下へ 6 cm（`APPROACH_SIDE` / `APPROACH_FWD` / `APPROACH_UP`。水平には 0.30 m で、真横から前へ 35°）にした。手は右斜め前のやや下から顔へ直線で近づく。経路 0.286 m、2 cm/s で 14.3 秒（以前と同じ）。参加者の視野には以前より早く入る。終点は `FACE_FWD` 0.115 → 0.095（接触点は目標の 2 cm 手前なので、顔の前約 10.6 cm・正中の右約 1.6 cm。以前より約 1 cm 顔に近い）。右後ろ 125° からでは腕が始点に届かない（必要な距離が腕の長さの 1.03〜1.2 倍）ので、NPC の立つ方位を 110°（真横より 20° 後ろ）にし、立ち位置の計算に始点の条件を加えた: 終点の手首が腕の長さの 0.88 倍（`TOUCH_STAND_FACTOR`）以内になるいちばん遠い距離から、始点の手首が 0.92 倍（`TOUCH_START_FACTOR`）以内になるまで近づく（最小 0.30 m）。エディタでは 0.34 m、`reachable=true`。
  - **試行中の鏡を参加者の身長に合わせる（2026-11-11）**: 固定の 0.8〜1.75 m では、背の高いアバターの頭が切れる。平面鏡では高さ y の点が鏡の (目の高さ + y) / 2 の位置に映る（距離によらない）ので、Trial - Touch の開始時に MirrorPanel アイテム（`mp_fitTouch`、builder の `MirrorPanelLegacy`）が参加者の Head ボーンと足元の高さを読み、鏡の下端を (目 + 床) / 2 − 5 cm、上端を (目 + 頭頂) / 2 + 5 cm にする（目 = Head ボーン + 7 cm、頭頂 = Head ボーン + 22 cm）。NPC は床かライザーの上に立ち、頭の高さは参加者に合わせてあるので、同じ範囲に収まる。幅 0.9 m、距離 1.3 m は固定。範囲は 0.3〜2.1 m（`TouchMirrorMinBottom` / `TouchMirrorMaxTop`）。ボーンが読めない間は毎フレーム再試行し、それまではシーンの既定（0.8〜1.75 m）。高さは `SubNode.setPosition`、大きさは `getUnityComponent('Transform').unityProp.localScale`（指示板の背景と同じ方法）。ログ `[MirrorPanel] touch mirror 0.73..1.69 m`（エディタの透明アバター）。目安: 身長 1.9 m 前後で 0.88〜1.95 m（縦 約 16 px/deg）、2.0 m で 0.93〜2.05 m。2.4 m 級では上端 2.1 m で頭が切れる。指示文の「touch」位置は、鏡がいちばん高くなったときの上端（2.1 m）の上に固定した（文字の中心 2.24 m、目の高さ 1.55 m から見て約 28° 上）。距離 1.3 m（Quest でアバター以外が消えない距離）は変えていない。
  - **手の終点を前・上・正面寄りに、NPC を近くに（2026-11-11）**: 目標点を正中（`FACE_SIDE` 0.015 → 0）、Head ボーンの 4 cm 上（`FACE_UP` 0.02 → 0.04。目ボーンを使う本番では目の 2.5 cm 下、`CHEEK_BELOW_EYES` 0.045 → 0.025）、前へ 11.5 cm（`FACE_FWD` 0.09 → 0.115。顔の表面より少し前）にした。手は右から来て 2 cm 手前で止まるので、曲げた指の接触点は正中の約 2 cm 右、右目の下〜鼻の横の前で止まり、手は右目の前を覆う（参考画像に近い）。触る段階の立ち位置は、腕を伸ばし切らないように新しい `TOUCH_STAND_FACTOR` 0.88（挨拶の距離は従来の `STAND_FACTOR` 0.93 のまま）で求める。エディタでは最小距離 0.30 m（`TOUCH_MIN_STAND_DIST`）で止まり（以前は 0.36 m）、そこからでも届く（`reachable=true`、手首の誤差 3 mm）。
  - **戻りの軌跡を曲線に（3 回目）**: 撫で終わりから次の撫で始めへの戻りは、以前の「引く → 上がる → 近づく」の 3 直線（四角い軌跡）をやめ、1 本の弧にした: 下端で顔から離れ、途中で顔から最大 3 cm（`STROKE_BACK`）まで膨らみ、上端で顔に戻る半楕円（撫でる長さ 6 cm・膨らみ 3 cm なので半径 3 cm の半円、長さ 9.4 cm）。弧に沿って 4 cm/s（`STROKE_RETURN_SPEED`）、始めと終わりは 0.4 秒の加減速。戻り 1 回は 2.76 秒で、撫でる時間は計 15.7 秒（下向き 3.4 秒 × 3 + 戻り 2.76 秒 × 2）。上の「18.6 秒」は 3 直線だったときの値。
  - **試行中の鏡を近くに**: Trial - Touch では 3 枚目の鏡 `MirrorTouch`（正面 1.0 m、1.2 × 1.8 m、中心の高さ 1.05 m）を出す。`MirrorFront`（1.6 m）は PoseCheck 専用に戻した。鏡が指示板「front」位置（1.5 m）より手前に来るので、Touch の指示文は専用の「touch」位置に出す: 鏡の面の 3 cm 手前、背景の下端が鏡の上端の 3 cm 上（中心の高さ 2.07 m、仰角約 28°）、文字は 0.0155（front 位置と同じ見かけの大きさ）。鏡より手前かつ上なので、目の高さによらず鏡に隠れず、鏡にも映り込まない。
  - **接触点を顔の中央寄りに**: `FACE_SIDE` 0.04 → 0.015（正中から右へ 1.5 cm。手は右から来て 2 cm 手前で止まるので、接触点は正中から約 3.5 cm）。手のひらの向きも正面寄りに（`HAND_ACROSS_YAW_DEG` 30 → 20）。立ち位置は自動で再計算され、エディタでは 0.36 m。
  - **部屋**: ルート `Room`（メニュー `LUIDA > Study4 > Build room (keep scene)`、`BuildRoom`。フルビルドにも入れた）。5 × 5 × 2.9 m、参加者の前 2.9 m・後ろ 1.9 m・左右 2.35 m に壁。Unity Asset Store の Apartment Kit（Brick Project Studio、無料）のうち、壁・天井・巾木のモデル 3 つと、テクスチャ 2 枚（壁と天井のアトラス、床の板張り）だけを、元のパスと GUID のまま `Assets/Brick Project Studio/` に入れた（計 5.5 MB、スクリプトなし）。キットは 2.5 m グリッド・高さ 4 m なので、高さ方向に 0.725 倍、巾木は 7 cm に縮めている。床はクアッド 1 枚で、テンプレートの床（`Environment/Plane`）は描画だけ切った（コライダーはそのまま）。壁には BoxCollider。
    - 負荷（HMD 単機を想定。鏡が部屋をもう一度描く）: マテリアル 3 つ（`RoomWall` / `RoomFloor` / `RoomBaseboard`）、法線マップなし、影なし、ライトやプローブの追加なし、テクスチャは 512 と 1024 に制限、21 オブジェクトを静的バッチ。明るさの大半はエミッション（`RoomGlow` = 0.8）で、シーンのライトと環境光に反応するのは `RoomLit` = 0.3 の分だけ（ライトの設定によらずほぼ均一に明るい）。ライトマップは焼いていない。
    - ライセンス: Asset Store の標準 EULA。成果物（ワールド）に含めるのは可だが、アセットそのものを公開リポジトリに置くのは不可なので、`Assets/Brick Project Studio/` を公開リポジトリへ push しないこと。ファイルが無い環境では `BuildRoom` は警告を出して何もしない。
    - 作り込んでいないもの: 参考画像 2 のクローゼットの扉と柱、ドア、照明器具。
- **未対応・既知の点**:
  - NPC が参加者に近い（約 0.4 m）ので、NPC の `Riser`（0.8 m 角、NPC が低いとき）は参加者の足元に一部重なり、参加者の `HeightPlatform`（1.6 m 角、参加者が低いとき）は NPC の足元を含む（NPC の足が台に埋まる。従来の正面約 0.5 m でも同じ）。どちらも見た目だけの問題。台を小さくすると挨拶の間に歩いたとき台から落ちやすくなるので、変えていない。
  - 撫でる下端（頬から 6 cm 下）はあごの辺りになる（`STROKE_AMP`）。

## 11. 社会的条件を参加者内に（2026-11-11）

- **計画**: 社会的条件（with / without）を参加者間から参加者内へ。アバター条件のブロック（`block`、順序は参加者間の `order`）ごとに with と without を 1 試行ずつ、ブロック内の順序はランダム（LUIDA の within 変数 `social`、`isRandom: true`。非ランダムの変数が外側になり、ランダムの変数はブロックごとに並べ替えられる）。計 4 試行（各条件 1 試行）。以前は social が参加者間で、各ブロック 2 試行（`rep`=1,2）。
- **挨拶**: 毎試行、その試行の社会的条件で 20 秒（`GreetingSeconds`）。指示文は「20秒間、目の前のアバターを見ながら挨拶してください。…」。身長合わせは毎試行やり直す（同じアバターなので結果は同じ）。
- **SocialPresence**: Trial - Report の直後（ループ内）で毎試行答える（質問紙は「ステートの訪問ごとに 1 回」答えられる、§9）。行は試行ごとに `cond.social` と `cond.block` で区別できる。
- **アバター着替え・ポーズ確認・VEQ**: ブロックごと（着替えとポーズ確認はブロックの 1 試行目、VEQ はブロックの最後の試行の後）。
- **「rep」の置き換え**: 試行のブロック内の位置は、Global の Integer `exp_trialID`（0 始まりの試行番号、Trial - Start に入った時点で更新済み）から求める（`trialInBlock()` = `exp_trialID % 2 + 1`、`firstTrialOfBlock()`, `lastTrialOfBlock()`。builder の `BlockTrialJs` を各アイテムのコードに入れている）。NPC の行データの `npcRep` はこの値。
- **反映**: メニュー `LUIDA > Study4 > Make social within-subject (keep scene)`。ステートリストを新しい順序に並べ替え（各ステートの Exit Time などはそのまま）、実験変数 JS を書き直し、ステートオブジェクトの並びと遷移（現在・遷移先・Exit Time・Trial - Rest から Trial - Start への戻り）を番号ごと合わせてから、レイアウトとアイテムの動作を更新する。質問紙フォームは作り直さない。エディタで 2 試行通して確認（1 試行目 without、2 試行目 with、どちらもブロック 1。2 試行目は着替えとポーズ確認を飛ばして挨拶から。VEQ は 1 試行目では飛ばし、2 試行目で表示）。
- **所要時間**: 挨拶 20 秒 × 4（以前 30 秒 × 2）、SocialPresence × 4（以前 1 回）。
- **Web Console**: 参加者間の変数が `order` だけになった。条件の割り当て設定が Web Console 側にある場合は合わせること。

