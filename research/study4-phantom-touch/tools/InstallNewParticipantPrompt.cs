// Installs the new-participant prompt into the LUIDA manager prefabs. Run once in the Unity editor as the body of
// an editor method (Unity MCP "execute_code"; its compiler accepts no local functions, hence the delegates).
// See session-reset-prompt-plan.md section 3.2. Safe to run again (it also renames the former "Yes" button).
//
//   ParticipantManager.prefab
//     NewParticipantPrompt (inactive)            red panel 0.4 x 0.28 m: background quad, TextView (white, 0.015),
//                                                "OK" (orange button, the collider of this item) centred below the text
//     GlobalLogic x5 on exp_sessionReset         state_exited, state_currentID = 0, exp_trialID = 0,
//                                                exp_readyToLeaveTrials = false, exp_arePlayersEnough = false
//   LUIDA-ExpManagers.prefab
//     NewParticipantPromptNo (Item + MovableItem + ScriptableItem NewParticipantPromptNo.js, Body inactive):
//                                                "続きから / Resume" button, parked under the panel's preview pose
//     ParticipantManager instance: world item reference "NewParticipantPromptNo"
//   Materials NewParticipantPromptPanel / NewParticipantPromptButton next to the WaitingMessage material.
// The ParticipantManager.js constants (NR_DIST 0.5 m, NR_NO_OFFSET (0, -0.105, -0.01)) match this layout.
var sb = new System.Text.StringBuilder();
const string PM_PATH = "Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/Prefabs/ParticipantManager.prefab";
const string EM_PATH = "Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/Prefabs/LUIDA-ExpManagers.prefab";
const string NO_JS = "Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/Scripts/ParticipantHandler/NewParticipantPromptNo.js";
const string TEMPLATE = "ClusterMetaverseLab/LuidaExpTemplate/FakeGimmickSources/ResetGlobalBool";
const string SIGNAL = "exp_sessionReset";
const string FALLBACK_MAT_DIR = "Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/Prefabs/Materials";
const string ASK = "中断または終了したセッションに入ったようです。\n「OK」を押すと、実験を最初から始めます。\nIt seems you have entered a session that\nwas interrupted or has ended.\nPress OK to restart the experiment\nfrom the beginning.";
var PANEL_SIZE = new Vector3(0.4f, 0.28f, 1f);
var BUTTON_SIZE = new Vector2(0.14f, 0.05f);
var TEXT_POS = new Vector3(0f, 0.05f, -0.01f);
var OK_POS = new Vector3(0f, -0.045f, -0.005f);
var NO_OFFSET = new Vector3(0f, -0.105f, -0.01f);
var PANEL_PREVIEW_POS = new Vector3(0f, 1.4f, 1.2f);   // parked / preview pose in the ParticipantManager's frame
var PANEL_COLOR = new Color(0.72f, 0.11f, 0.11f, 1f);   // attention red
var BUTTON_COLOR = new Color(1f, 0.62f, 0.05f, 1f);     // orange
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
// A plain single-colour material asset in the LUIDA template folder (the WaitingMessage material is a CCK
// template material with its own colour, so it is not reused).
System.Func<Material, string, Color, Material> MakeMat = (src, name, color) =>
{
    var dir = FALLBACK_MAT_DIR;
    if (!AssetDatabase.IsValidFolder(dir)) { System.IO.Directory.CreateDirectory(dir); AssetDatabase.Refresh(); }
    var path = dir + "/" + name + ".mat";
    var m = AssetDatabase.LoadAssetAtPath<Material>(path);
    if (m == null)
    {
        var shader = src != null && src.shader != null ? src.shader : Shader.Find("Standard");
        m = new Material(shader);
        AssetDatabase.CreateAsset(m, path);
    }
    m.color = color;
    if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", color);
    if (m.HasProperty("_Color")) m.SetColor("_Color", color);
    if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", 0.2f);
    if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", 0f);
    EditorUtility.SetDirty(m);
    return m;
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
System.Action<GameObject, ClusterVR.CreatorKit.World.Implements.TextView.TextView, string, float, Color, Vector3> Text = (go, src, text, size, color, localPos) =>
{
    var tv = (ClusterVR.CreatorKit.World.Implements.TextView.TextView)Ensure(go, typeof(ClusterVR.CreatorKit.World.Implements.TextView.TextView));
    if (src != null) EditorUtility.CopySerialized(src, tv);
    var so = new SerializedObject(tv);
    so.FindProperty("text").stringValue = text;
    so.FindProperty("size").floatValue = size;
    so.FindProperty("color").colorValue = color;
    so.FindProperty("textMesh").objectReferenceValue = null;
    so.ApplyModifiedPropertiesWithoutUndo();
    go.transform.localPosition = localPos;
    go.transform.localRotation = Quaternion.identity;
    go.transform.localScale = Vector3.one;
};
// Button: an unscaled GameObject with the collider, a scaled quad and a label (keeps the label unscaled).
System.Action<GameObject, Material, ClusterVR.CreatorKit.World.Implements.TextView.TextView, string, float, Vector3> Button = (go, mat, src, label, labelSize, localPos) =>
{
    go.transform.localPosition = localPos;
    go.transform.localRotation = Quaternion.identity;
    go.transform.localScale = Vector3.one;
    var bc = (BoxCollider)Ensure(go, typeof(BoxCollider));
    bc.isTrigger = false;
    bc.center = Vector3.zero;
    bc.size = new Vector3(BUTTON_SIZE.x, BUTTON_SIZE.y, 0.02f);
    Quad(Child(go, "Quad"), mat, new Vector3(BUTTON_SIZE.x, BUTTON_SIZE.y, 1f));
    Text(Child(go, "Text"), src, label, labelSize, Color.black, new Vector3(0f, 0f, -0.01f));
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
Material panelMat = null, buttonMat = null;
var pmRoot = PrefabUtility.LoadPrefabContents(PM_PATH);
try
{
    var pmItem = pmRoot.GetComponent<ClusterVR.CreatorKit.Item.Implements.Item>();
    var waiting = pmRoot.transform.Find("WaitingMessage");
    if (pmItem == null || waiting == null) throw new System.Exception("ParticipantManager prefab: Item or WaitingMessage missing");
    var srcMat = waiting.GetComponent<MeshRenderer>().sharedMaterial;
    var srcText = waiting.Find("Text").GetComponent<ClusterVR.CreatorKit.World.Implements.TextView.TextView>();
    panelMat = MakeMat(srcMat, "NewParticipantPromptPanel", PANEL_COLOR);
    buttonMat = MakeMat(srcMat, "NewParticipantPromptButton", BUTTON_COLOR);

    var panel = Child(pmRoot, "NewParticipantPrompt");
    panel.transform.localPosition = PANEL_PREVIEW_POS;
    panel.transform.localRotation = Quaternion.identity;
    panel.transform.localScale = Vector3.one;
    Quad(Child(panel, "NewParticipantPromptBack"), panelMat, PANEL_SIZE);
    Text(Child(panel, "NewParticipantPromptText"), srcText, ASK, 0.015f, Color.white, TEXT_POS);
    var oldYes = panel.transform.Find("NewParticipantPromptYes");
    if (oldYes != null) oldYes.name = "NewParticipantPromptOk";
    Button(Child(panel, "NewParticipantPromptOk"), buttonMat, srcText, "OK", 0.02f, OK_POS);
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
    sb.AppendLine("ParticipantManager.prefab: prompt sub-nodes + " + pmRoot.GetComponents<ClusterVR.CreatorKit.Operation.Implements.GlobalLogic>().Length + " GlobalLogic(s) in total; materials at " + AssetDatabase.GetAssetPath(panelMat));
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
    var srcText2 = pmT.Find("WaitingMessage/Text").GetComponent<ClusterVR.CreatorKit.World.Implements.TextView.TextView>();

    var noGo = Child(emRoot, "NewParticipantPromptNo");
    noGo.transform.localPosition = pmT.localPosition + PANEL_PREVIEW_POS + NO_OFFSET;   // parked under the panel's preview pose
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
    Button(body, buttonMat, srcText2, "続きから / Resume", 0.016f, Vector3.zero);
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
