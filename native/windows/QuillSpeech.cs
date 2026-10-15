using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Runtime.InteropServices;
using System.Speech.Recognition;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// JSON-lines bridge. No audio files or network services are used.
class QuillSpeech {
    static readonly object gate = new object();
    static readonly JavaScriptSerializer json = new JavaScriptSerializer();
    static SpeechRecognitionEngine recognizer;
    static readonly List<string> words = new List<string>();
    static DateTime started;
    static bool cancelled;
    static string state = "idle";
    static string microphone = "unknown";
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION data; }
    [StructLayout(LayoutKind.Explicit)] struct INPUTUNION {
        [FieldOffset(0)] public KEYBDINPUT keyboard;
        [FieldOffset(0)] public MOUSEINPUT mouse;
    }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int x,y; public uint data,flags,time; public UIntPtr extra; }
    static void Emit(string type, object id = null, params object[] pairs) {
        lock(gate) {
            var data = new Dictionary<string,object>(); data["type"]=type;
            if(id!=null) data["id"]=id;
            for(int i=0;i<pairs.Length;i+=2) data[(string)pairs[i]]=pairs[i+1];
            Console.WriteLine(json.Serialize(data)); Console.Out.Flush();
        }
    }
    static void Error(object id, string code, string message) { Emit("error",id,"code",code,"message",message); }
    static void Status(string type, object id) {
        var languages = SpeechRecognitionEngine.InstalledRecognizers().Select(r=>r.Culture.Name).Distinct().ToArray();
        Emit(type,id,"state",state,"platform","Windows","protocolVersion",1,"supportedLanguages",languages,
            "permissions",new { accessibility=true, microphone=microphone, speech=languages.Length>0?"authorized":"unavailable" });
    }
    static string Value(Dictionary<string,object> c,string key,string fallback="") { return c.ContainsKey(key)?Convert.ToString(c[key],CultureInfo.InvariantCulture):fallback; }
    static void Start(Dictionary<string,object> c,object id) {
        if(state!="idle") { Error(id,"busy","Dictation is already active."); return; }
        var language=Value(c,"language","auto");
        var installed=SpeechRecognitionEngine.InstalledRecognizers();
        var culture=language=="auto"?CultureInfo.CurrentCulture:new CultureInfo(language);
        var info=installed.FirstOrDefault(r=>r.Culture.Name.Equals(culture.Name,StringComparison.OrdinalIgnoreCase))
            ?? installed.FirstOrDefault(r=>r.Culture.TwoLetterISOLanguageName==culture.TwoLetterISOLanguageName);
        if(info==null) { Error(id,"language_unavailable","Install a Windows speech recognition language in Settings > Time & language > Speech, then select that language in Quill."); return; }
        recognizer=new SpeechRecognitionEngine(info);
        var current=recognizer;
        words.Clear(); cancelled=false; state="starting"; started=DateTime.UtcNow;
        current.LoadGrammar(new DictationGrammar());
        current.SpeechHypothesized+=(s,e)=> { lock(gate) { if(current==recognizer&&!cancelled) Emit("partial",null,"text",string.Join(" ",words.Concat(new[]{e.Result.Text}))); } };
        current.SpeechRecognized+=(s,e)=> { lock(gate) { if(current==recognizer&&!cancelled) { words.Add(e.Result.Text); Emit("partial",null,"text",string.Join(" ",words)); } } };
        current.AudioLevelUpdated+=(s,e)=> { lock(gate) { if(current==recognizer&&!cancelled) Emit("level",null,"level",e.AudioLevel/100.0); } };
        current.RecognizeCompleted+=(s,e)=> {
            lock(gate) {
                if(current!=recognizer) return;
                recognizer=null; state="idle";
                if(!cancelled) {
                    if(e.Error!=null && words.Count==0) Error(null,"recognition_failed",e.Error.Message);
                    else Emit("final",null,"text",string.Join(" ",words),"duration",(DateTime.UtcNow-started).TotalSeconds,"engine","windows-speech","onDevice",true,"language",info.Culture.Name);
                }
                ThreadPool.QueueUserWorkItem(_=>current.Dispose());
            }
        };
        try {
            current.SetInputToDefaultAudioDevice(); microphone="authorized";
            current.RecognizeAsync(RecognizeMode.Multiple); state="listening";
            Emit("listening",id,"language",info.Culture.Name,"engine","windows-speech","onDevice",true);
        } catch { recognizer=null; state="idle"; current.Dispose(); microphone="unavailable"; throw; }
    }
    static INPUT Key(ushort vk,bool up) { return new INPUT { type=1,data=new INPUTUNION { keyboard=new KEYBDINPUT {vk=vk,flags=up?2u:0u} } }; }
    static void Paste(Dictionary<string,object> c,object id) {
        long hwnd;
        if(!long.TryParse(Value(c,"bundleId"),out hwnd)||hwnd==0||!IsWindow(new IntPtr(hwnd))) { Error(id,"paste_target_missing","The destination closed. Paste your copied transcript manually with Ctrl+V."); return; }
        var target=new IntPtr(hwnd);
        // Never inject into another foreground app if Windows refuses activation.
        if(GetForegroundWindow()!=target) SetForegroundWindow(target);
        for(int i=0;i<20&&GetForegroundWindow()!=target;i++) Thread.Sleep(25);
        if(GetForegroundWindow()!=target) { Error(id,"paste_target_not_focused","Windows could not focus the destination. Paste manually with Ctrl+V."); return; }
        for(int i=0;i<40;i++) {
            if(new[]{0x10,0x11,0x12,0x5b,0x5c}.All(k=>(GetAsyncKeyState(k)&0x8000)==0)) break;
            Thread.Sleep(20);
        }
        if(new[]{0x10,0x11,0x12,0x5b,0x5c}.Any(k=>(GetAsyncKeyState(k)&0x8000)!=0)||GetForegroundWindow()!=target) { Error(id,"paste_target_not_focused","Release the shortcut keys and paste manually with Ctrl+V."); return; }
        var keys=new[]{Key(0x11,false),Key(0x56,false),Key(0x56,true),Key(0x11,true)};
        if(SendInput(4,keys,Marshal.SizeOf(typeof(INPUT)))!=4) {
            SendInput(2,new[]{Key(0x56,true),Key(0x11,true)},Marshal.SizeOf(typeof(INPUT)));
            Error(id,"paste_blocked","Windows blocked automatic paste. Paste manually with Ctrl+V; elevated apps may reject input from Quill.");
        } else Emit("pasted",id,"posted",true);
    }
    static int Main(string[] args) {
        Console.InputEncoding=new UTF8Encoding(false); Console.OutputEncoding=new UTF8Encoding(false);
        if(args.Contains("--self-test")) {
            if(Marshal.SizeOf(typeof(INPUT))!=(IntPtr.Size==8?40:28)) return 1;
            Emit("self-test",null,"ok",true); return 0;
        }
        Status("ready",null);
        try {
            string line;
            while((line=Console.ReadLine())!=null) {
                object id=null;
                try {
                    var c=json.Deserialize<Dictionary<string,object>>(line);
                    if(c==null) throw new ArgumentException("Expected a JSON object.");
                    if(c.ContainsKey("id")) id=c["id"];
                    var type=Value(c,"type");
                    if(type=="quit") break;
                    if(type=="paste") { Paste(c,id); continue; }
                    lock(gate) {
                        switch(type) {
                            case "status": Status("status",id); break;
                            case "frontmost":
                                var h=GetForegroundWindow(); uint pid; GetWindowThreadProcessId(h,out pid);
                                string name="Windows app";
                                try { name=Process.GetProcessById((int)pid).ProcessName; } catch {}
                                Emit("frontmost",id,"bundleId",h.ToInt64().ToString(CultureInfo.InvariantCulture),"name",name,"pid",pid); break;
                            case "start": Start(c,id); break;
                            case "stop":
                                if(recognizer==null) Emit("stopped",id);
                                else { state="stopping"; recognizer.RecognizeAsyncStop(); }
                                break;
                            case "cancel":
                                cancelled=true;
                                if(recognizer!=null) { state="stopping"; recognizer.RecognizeAsyncCancel(); }
                                Emit("cancelled",id); break;
                            default: Error(id,"invalid_command","Unknown command."); break;
                        }
                    }
                } catch(Exception e) {
                    if(state=="starting") { state="idle"; if(recognizer!=null) { recognizer.Dispose(); recognizer=null; } }
                    Error(id,"recognition_failed",e.Message);
                }
            }
        } finally { cancelled=true; if(recognizer!=null) recognizer.Dispose(); }
        return 0;
    }
}
