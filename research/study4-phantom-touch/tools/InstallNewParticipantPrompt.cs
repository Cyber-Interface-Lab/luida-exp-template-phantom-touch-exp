// Installs the new-participant prompt into the LUIDA manager prefabs. Run once in the Unity editor as the body of
// an editor method (Unity MCP "execute_code"; its compiler accepts no local functions, hence the delegates).
// See session-reset-prompt-plan.md section 3.2. Safe to run again.
//
//   ParticipantManager.prefab
//     NewParticipantPrompt (inactive)            panel: background quad, TextView, "はい" (collider of this item)
//     GlobalLogic x5 on exp_sessionReset         state_exited, state_currentID = 0, exp_trialID = 0,
//                                                exp_readyToLeaveTrials = false, exp_arePlayersEnough = false
//   LUIDA-ExpManagers.prefab
//     NewParticipantPromptNo (Item + MovableItem + ScriptableItem NewParticipantPromptNo.js, Body inactive)
//     ParticipantManager instance: world item reference "NewParticipantPromptNo"
var sb = new System.Text.StringBuilder();
const string PM_PATH = "Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/Prefabs/ParticipantManager.prefab";
const string EM_PATH = "Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/Prefabs/LUIDA-ExpManagers.prefab";
const string NO_JS = "Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/Scripts/ParticipantHandler/NewParticipantPromptNo.js";
const string TEMPLATE = "ClusterMetaverseLab/LuidaExpTemplate/FakeGimmickSources/ResetGlobalBool";
const string SIGNAL = "exp_sessionReset";
const string ASK = "あなたは新しく入った参加者ですか？\n新しい参加者の方は「はい」を押してください。";
var flags = System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance;

System.Func<GameObject, string, GameObject> Child = (parent, name) =>
{
    var t = parent.transform.Find(name);
    if (t != null) return t.gameObject;
    var go = new GameObject(name);
    go.transform.SetParent(parent.transform, false);
    return go;
};
System.Func<GameObject, System.Type, Component> Ensure = (go, type) =>
{
    var c = go.GetComponent(type);
    return c != null ? c : go.AddComponent(type);
};
System.Action<GameObject, Material, Vector3> Quad = (go, mat, scale) =>
{
    ((MeshFilter)Ensure(go, typeof(MeshFilter))).sharedMesh = Resources.GetBuiltinResource<Mesh>("Quad.fbx");
    var mr = (MeshRenderer)Ensure(go, typeof(MeshRenderer));
    mr.sharedMaterial = mat;
    mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
    mr.receiveShadows = false;
    go.transform.localPosition = Vector3.zero;
    go.transform.localRotation = Quaternion.identity;
    go.transform.localScale = scale;
};
System.Action<GameObject, ClusterVR.CreatorKit.World.Implements.TextView.TextView, string, float, Vector3> Text = (go, src, text, size, localPos) =>
{
    var tv = (ClusterVR.CreatorKit.World.Implements.TextView.TextView)Ensure(go, typeof(ClusterVR.CreatorKit.World.Implements.TextView.TextView));
    if (src != null) EditorUtility.CopySerialized(src, tv);
    var so = new SerializedObject(tv);
    so.FindProperty("text").stringValue = text;
    so.FindProperty("size").floatValue = size;
    so.FindProperty("textMesh").objectReferenceValue = null;
    so.ApplyModifiedPropertiesWithoutUndo();
    go.transform.localPosition = localPos;
    go.transform.localRotation = Quaternion.identity;
    go.transform.localScale = Vector3.one;
};
// Button: an unscaled GameObject with the collider, a scaled quad and a text (keeps the text unscaled).
System.Action<GameObject, Material, ClusterVR.CreatorKit.World.Implements.TextView.TextView, string, Vector3> Button = (go, mat, src, label, localPos) =>
{
    go.transform.localPosition = localPos;
    go.transform.localRotation = Quaternion.identity;
    go.transform.localScale = Vector3.one;
    var bc = (BoxCollider)Ensure(go, typeof(BoxCollider));
    bc.isTrigger = false;
    bc.center = Vector3.zero;
    bc.size = new Vector3(0.3f, 0.12f, 0.02f);
    Quad(Child(go, "Quad"), mat, new Vector3(0.3f, 0.12f, 1f));
    Text(Child(go, "Text"), src, label, 0.05f, new Vector3(0f, 0f, -0.01f));
};
System.Action<ClusterVR.CreatorKit.Item.Implements.WorldItemReferenceList, string, ClusterVR.CreatorKit.Item.Implements.Item> SetWorldItemReference = (list, id, target) =>
{
    var so = new SerializedObject(list);
    var prop = so.FindProperty("worldItemReferences");
    for (int i = 0; i < prop.arraySize; i++)
    {
        var e = prop.GetArrayElementAtIndex(i);
        if (e.FindPropertyRelative("id").stringValue == id)
        {
            e.FindPropertyRelative("item").objectReferenceValue = target;
            so.ApplyModifiedPropertiesWithoutUndo();
            return;
        }
    }
    prop.InsertArrayElementAtIndex(prop.arraySize);
    var el = prop.GetArrayElementAtIndex(prop.arraySize - 1);
    el.FindPropertyRelative("id").stringValue = id;
    el.FindPropertyRelative("item").objectReferenceValue = target;
    so.ApplyModifiedPropertiesWithoutUndo();
};

AssetDatabase.ImportAsset(NO_JS, ImportAssetOptions.ForceSynchronousImport);
var noJs = AssetDatabase.LoadAssetAtPath<ClusterVR.CreatorKit.Item.Implements.JavaScriptAsset>(NO_JS);
if (noJs == null) throw new System.Exception("JavaScriptAsset not found: " + NO_JS);

// ---- ParticipantManager.prefab ----
var pmRoot = PrefabUtility.LoadPrefabContents(PM_PATH);
try
{
    var pmItem = pmRoot.GetComponent<ClusterVR.CreatorKit.Item.Implements.Item>();
    var waiting = pmRoot.transform.Find("WaitingMessage");
    if (pmItem == null || waiting == null) throw new System.Exception("ParticipantManager prefab: Item or WaitingMessage missing");
    var mat = waiting.GetComponent<MeshRenderer>().sharedMaterial;
    var srcText = waiting.Find("Text").GetComponent<ClusterVR.CreatorKit.World.Implements.TextView.TextView>();

    var panel = Child(pmRoot, "NewParticipantPrompt");
    panel.transform.localPosition = new Vector3(0f, 1.4f, 1.2f);   // parked / preview pose; placed at runtime
    panel.transform.localRotation = Quaternion.identity;
    panel.transform.localScale = Vector3.one;
    Quad(Child(panel, "NewParticipantPromptBack"), mat, new Vector3(0.9f, 0.45f, 1f));
    Text(Child(panel, "NewParticipantPromptText"), srcText, ASK, 0.04f, new Vector3(0f, 0.07f, -0.01f));
    Button(Child(panel, "NewParticipantPromptYes"), mat, srcText, "はい", new Vector3(-0.2f, -0.15f, -0.005f));
    panel.SetActive(false);

    foreach (var gl in pmRoot.GetComponents<ClusterVR.CreatorKit.Operation.Implements.GlobalLogic>())
    {
        var k = new SerializedObject(gl).FindProperty("globalGimmickKey.key.key");
        if (k != null && k.stringValue == SIGNAL) UnityEngine.Object.DestroyImmediate(gl);
    }
    var templatePrefab = Resources.Load<GameObject>(TEMPLATE);
    if (templatePrefab == null) throw new System.Exception("ResetGlobalBool template missing");
    var template = templatePrefab.GetComponent<ClusterVR.CreatorKit.Operation.Implements.GlobalLogic>();
    System.Action<string, int, object> AddGlobalWrite = (targetKey, paramType, value) =>
    {
        var relay = pmRoot.AddComponent<ClusterVR.CreatorKit.Operation.Implements.GlobalLogic>();
        EditorUtility.CopySerialized(template, relay);
        var gk = System.Activator.CreateInstance(typeof(ClusterVR.CreatorKit.Gimmick.Implements.GlobalGimmickKey));
        typeof(ClusterVR.CreatorKit.Gimmick.Implements.GlobalGimmickKey).GetField("key", flags)
            .SetValue(gk, new ClusterVR.CreatorKit.Gimmick.Implements.GimmickKey(ClusterVR.CreatorKit.Gimmick.GimmickTarget.Item, SIGNAL));
        typeof(ClusterVR.CreatorKit.Gimmick.Implements.GlobalGimmickKey).GetField("item", flags).SetValue(gk, pmItem);
        typeof(ClusterVR.CreatorKit.Operation.Implements.GlobalLogic).GetField("globalGimmickKey", flags).SetValue(relay, gk);
        if (paramType == 0) LuidaFakeGimmick.PatchStatementAtSignal(relay, 0, targetKey);
        else LuidaFakeGimmick.PatchStatementAt(relay, 0, targetKey, paramType, value);
        EditorUtility.SetDirty(relay);
    };
    AddGlobalWrite("state_exited", 0, null);
    AddGlobalWrite("state_currentID", 3, 0);
    AddGlobalWrite("exp_trialID", 3, 0);
    AddGlobalWrite("exp_readyToLeaveTrials", 1, false);
    AddGlobalWrite("exp_arePlayersEnough", 1, false);

    PrefabUtility.SaveAsPrefabAsset(pmRoot, PM_PATH);
    sb.AppendLine("ParticipantManager.prefab: prompt sub-nodes + " + pmRoot.GetComponents<ClusterVR.CreatorKit.Operation.Implements.GlobalLogic>().Length + " GlobalLogic(s) in total");
}
finally
{
    PrefabUtility.UnloadPrefabContents(pmRoot);
}

// ---- LUIDA-ExpManagers.prefab ----
var emRoot = PrefabUtility.LoadPrefabContents(EM_PATH);
try
{
    Transform pmT = null;
    foreach (Transform t in emRoot.transform)
        if (t.name == "ParticipantManager" && t.GetComponent<ClusterVR.CreatorKit.Item.Implements.Item>() != null) pmT = t;
    if (pmT == null) throw new System.Exception("ParticipantManager instance not found in LUIDA-ExpManagers.prefab");
    var refList = pmT.GetComponent<ClusterVR.CreatorKit.Item.Implements.WorldItemReferenceList>();
    if (refList == null) refList = pmT.gameObject.AddComponent<ClusterVR.CreatorKit.Item.Implements.WorldItemReferenceList>();
    var mat2 = pmT.Find("WaitingMessage").GetComponent<MeshRenderer>().sharedMaterial;
    var srcText2 = pmT.Find("WaitingMessage/Text").GetComponent<ClusterVR.CreatorKit.World.Implements.TextView.TextView>();

    var noGo = Child(emRoot, "NewParticipantPromptNo");
    // parked next to the panel's preview pose (ParticipantManager sits at (0, 0, -2) in this prefab)
    noGo.transform.localPosition = pmT.localPosition + new Vector3(0.2f, 1.25f, 1.2f);
    noGo.transform.localRotation = Quaternion.identity;
    noGo.transform.localScale = Vector3.one;
    var noItem = (ClusterVR.CreatorKit.Item.Implements.Item)Ensure(noGo, typeof(ClusterVR.CreatorKit.Item.Implements.Item));
    var itemSo = new SerializedObject(noItem);
    var nameProp = itemSo.FindProperty("itemName");
    if (nameProp != null) { nameProp.stringValue = "NewParticipantPromptNo"; itemSo.ApplyModifiedPropertiesWithoutUndo(); }
    var rb = (Rigidbody)Ensure(noGo, typeof(Rigidbody));
    rb.useGravity = false;
    rb.isKinematic = true;
    Ensure(noGo, typeof(ClusterVR.CreatorKit.Item.Implements.MovableItem));
    var si = (ClusterVR.CreatorKit.Item.Implements.ScriptableItem)Ensure(noGo, typeof(ClusterVR.CreatorKit.Item.Implements.ScriptableItem));
    var siSo = new SerializedObject(si);
    siSo.FindProperty("sourceCodeAsset").objectReferenceValue = noJs;
    siSo.ApplyModifiedPropertiesWithoutUndo();
    var body = Child(noGo, "Body");
    Button(body, mat2, srcText2, "いいえ（続きから）", Vector3.zero);
    body.SetActive(false);

    SetWorldItemReference(refList, "NewParticipantPromptNo", noItem);
    PrefabUtility.SaveAsPrefabAsset(emRoot, EM_PATH);
    sb.AppendLine("LUIDA-ExpManagers.prefab: NewParticipantPromptNo item + reference on ParticipantManager");
}
finally
{
    PrefabUtility.UnloadPrefabContents(emRoot);
}
AssetDatabase.SaveAssets();
return sb.ToString();
