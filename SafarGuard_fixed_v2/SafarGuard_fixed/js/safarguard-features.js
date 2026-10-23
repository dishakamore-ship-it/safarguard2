/* SafarGuard extras: session history, analytics, profile/settings and live location. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let sessions = [];
  let locationWatchId = null;
  let latestPosition = null;

  const dateText = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  };
  const startDate = s => s.started_at ?? s.startedAt ?? "";
  const endDate = s => s.ended_at ?? s.endedAt ?? "";
  const averageEar = s => s.average_ear ?? s.averageEar ?? "";
  const eventCount = s => Number(s.event_count ?? s.eventCount ?? 0) || 0;
  const sessionId = s => s.id ?? s.sessionId ?? "—";
  const setText = (id, value) => { if ($(id)) $(id).textContent = String(value); };
  const setHistoryMessage = message => setText("sg-history-message", message);

  function renderHistory() {
    const tbody = $("sg-history-body");
    if (!tbody) return;
    tbody.replaceChildren();
    if (!sessions.length) {
      const row = document.createElement("tr"), cell = document.createElement("td");
      cell.colSpan = 5; cell.className = "sg-empty"; cell.textContent = "No session records found yet.";
      row.appendChild(cell); tbody.appendChild(row); return;
    }
    sessions.forEach(s => {
      const row = document.createElement("tr");
      [dateText(startDate(s)), dateText(endDate(s)), averageEar(s) === "" ? "—" : Number(averageEar(s)).toFixed(3), eventCount(s), sessionId(s)]
        .forEach(value => { const cell = document.createElement("td"); cell.textContent = String(value); row.appendChild(cell); });
      tbody.appendChild(row);
    });
  }

  async function loadSessions() {
    const refresh = $("sg-refresh-history");
    if (refresh) refresh.disabled = true;
    setHistoryMessage("Loading session history…");
    try {
      const response = await fetch("/api/sessions", {headers: {"Accept":"application/json"}});
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Unexpected session response");
      sessions = data;
      renderHistory(); renderWeeklyAnalytics();
      setHistoryMessage(`Loaded ${sessions.length} session record(s).`);
    } catch (error) {
      console.error("Session history could not load:", error);
      sessions = []; renderHistory(); renderWeeklyAnalytics();
      setHistoryMessage("Could not load history. Run app.py and open http://127.0.0.1:5000.");
    } finally {
      if (refresh) refresh.disabled = false;
    }
  }

  function downloadCSV() {
    if (!sessions.length) { setHistoryMessage("No session data to export. Refresh history first."); return; }
    const rows = [["Session ID","Started At","Ended At","Average EAR","Event Count"],
      ...sessions.map(s => [sessionId(s),startDate(s),endDate(s),averageEar(s),eventCount(s)])];
    const quote = v => {
      let value = String(v ?? "");
      if (/^[\s]*[=+\-@]/.test(value)) value = "'" + value;
      return '"' + value.replace(/"/g,'""') + '"';
    };
    const blob = new Blob(["\uFEFF" + rows.map(r => r.map(quote).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href=url; a.download="SafarGuard_Session_Report.csv"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    setHistoryMessage("CSV report downloaded.");
  }

  function renderWeeklyAnalytics() {
    const now = new Date(), start = new Date(now);
    start.setDate(now.getDate()-6); start.setHours(0,0,0,0);
    const weekly = sessions.filter(s => { const d = new Date(startDate(s)); return startDate(s) && !Number.isNaN(d.getTime()) && d >= start && d <= now; });
    setText("sg-week-sessions",weekly.length);
    setText("sg-week-events",weekly.reduce((sum,s)=>sum+eventCount(s),0));
    setText("sg-total-events",sessions.reduce((sum,s)=>sum+eventCount(s),0));
    const chart=$("sg-week-chart"); if(!chart) return;
    chart.replaceChildren();
    const days=[];
    for(let i=6;i>=0;i--){
      const d=new Date(now); d.setDate(now.getDate()-i); d.setHours(0,0,0,0);
      const count=weekly.filter(s=>{const x=new Date(startDate(s));return x.getFullYear()===d.getFullYear()&&x.getMonth()===d.getMonth()&&x.getDate()===d.getDate();}).length;
      days.push({label:d.toLocaleDateString(undefined,{weekday:"short"}),count});
    }
    const max=Math.max(1,...days.map(d=>d.count));
    days.forEach(d=>{
      const col=document.createElement("div"); col.className="sg-chart-column";
      const value=document.createElement("span"); value.className="sg-chart-value"; value.textContent=String(d.count);
      const bar=document.createElement("div"); bar.className="sg-chart-bar"; bar.style.height=`${Math.max(4,d.count/max*120)}px`;
      const label=document.createElement("span"); label.className="sg-chart-label"; label.textContent=d.label;
      col.append(value,bar,label); chart.appendChild(col);
    });
  }

  async function setupProfileSettings() {
    const name = $("sg-profile-name");
    const email = $("sg-profile-email");
    const save = $("sg-save-profile");
    const toggle = $("sg-alert-toggle");
    const language = $("sg-alert-language");
    if (!name || !email || !save || !toggle || !language) return;

    const message = $("sg-profile-message");
    let profileLoaded = false;

    const showMessage = (text, state = "") => {
      setText("sg-profile-message", text);
      if (message) message.dataset.state = state;
    };
    const renderProfile = profile => {
      name.value = profile.name || "";
      email.value = profile.email || "";
      toggle.checked = profile.alertsEnabled !== false;
      language.value = profile.alertLanguage || "en-IN";
      language.dataset.savedValue = language.value;
      setText("sg-profile-display", profile.name || "Driver Profile");
      setText("sg-profile-email-display", profile.email || "Your profile is ready to set up.");
      setText("sg-avatar", profile.name
        ? profile.name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase()
        : "SG");
    };
    const saveProfile = async payload => {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: {"Content-Type": "application/json", "Accept": "application/json"},
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `API returned ${response.status}`);
      return result;
    };

    save.disabled = true;
    toggle.disabled = true;
    language.disabled = true;
    showMessage("Loading your saved profile…");
    try {
      const response = await fetch("/api/profile", {headers: {"Accept": "application/json"}});
      const profile = await response.json();
      if (!response.ok) throw new Error(profile.error || `API returned ${response.status}`);
      renderProfile(profile);
      window.dispatchEvent(new CustomEvent("safarguardlanguagechange", {
        detail: {language: profile.alertLanguage || "en-IN"}
      }));
      profileLoaded = true;
      save.disabled = false;
      toggle.disabled = false;
      language.disabled = false;
      showMessage(profile.name ? "Profile loaded from the SafarGuard database." : "Add your details to set up your profile.");
    } catch (error) {
      console.error("Profile could not load:", error);
      showMessage("Could not load your profile. Start the Flask backend and refresh.", "error");
    }

    save.addEventListener("click", async () => {
      const n = name.value.trim();
      const e = email.value.trim();
      if (!n || !e) {
        showMessage("Please enter both your name and email.", "error");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        showMessage("Please enter a valid email address.", "error");
        return;
      }

      save.disabled = true;
      showMessage("Saving profile…");
      try {
        const profile = await saveProfile({
          name: n,
          email: e,
          alertsEnabled: toggle.checked,
          alertLanguage: language.value
        });
        renderProfile(profile);
        showMessage("Profile saved to the SafarGuard database.", "success");
      } catch (error) {
        console.error("Profile could not save:", error);
        showMessage(error.message || "Could not save your profile.", "error");
      } finally {
        save.disabled = !profileLoaded;
      }
    });

    toggle.addEventListener("change", async () => {
      if (!profileLoaded) return;
      const newValue = toggle.checked;
      toggle.disabled = true;
      try {
        const profile = await saveProfile({alertsEnabled: newValue});
        renderProfile(profile);
        showMessage("Alert preference saved to your profile.", "success");
      } catch (error) {
        console.error("Alert preference could not save:", error);
        toggle.checked = !newValue;
        showMessage(error.message || "Could not save your alert preference.", "error");
      } finally {
        toggle.disabled = false;
      }
    });

    language.addEventListener("change", async () => {
      if (!profileLoaded) return;
      const previous = language.dataset.savedValue || "en-IN";
      language.disabled = true;
      try {
        const profile = await saveProfile({alertLanguage: language.value});
        renderProfile(profile);
        language.dataset.savedValue = profile.alertLanguage;
        showMessage("Spoken alert language saved to your profile.", "success");
      } catch (error) {
        console.error("Spoken alert language could not save:", error);
        language.value = previous;
        window.dispatchEvent(new CustomEvent("safaraguardlanguagechange", {
          detail: {language: previous}
        }));
        showMessage(error.message || "Could not save the spoken alert language.", "error");
      } finally {
        language.disabled = false;
      }
    });
  }

  function locationStatus(title,detail,state=""){
    setText("sg-location-status",title); setText("sg-location-detail",detail);
    const dot=$("sg-location-dot"); if(dot) dot.className=("sg-location-dot "+state).trim();
  }
  function stopLocation(show=true){
    if(locationWatchId!==null&&navigator.geolocation) navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId=null;
    if($("sg-location-start")) $("sg-location-start").disabled=false;
    if($("sg-location-stop")) $("sg-location-stop").disabled=true;
    if(show) locationStatus("Live location stopped","Your browser has stopped updating this location.");
  }
  function setupLocation(){
    const start=$("sg-location-start"), stop=$("sg-location-stop"), map=$("sg-location-map");
    if(!start||!stop) return;
    start.addEventListener("click",()=>{
      if(!navigator.geolocation){locationStatus("Not supported","This browser does not support location.","error");return;}
      if(!window.isSecureContext){locationStatus("Secure connection required","Open through Flask at http://127.0.0.1:5000 or HTTPS.","error");return;}
      start.disabled=true; stop.disabled=false;
      locationStatus("Waiting for permission…","Allow location access in the browser prompt.");
      locationWatchId=navigator.geolocation.watchPosition(pos=>{
        latestPosition=pos;
        const {latitude,longitude,accuracy}=pos.coords;
        setText("sg-location-lat",latitude.toFixed(6)); setText("sg-location-lon",longitude.toFixed(6));
        setText("sg-location-accuracy",`± ${Math.round(accuracy)} m`);
        setText("sg-location-updated",new Date(pos.timestamp).toLocaleTimeString());
        if(map){map.href=`https://www.google.com/maps?q=${latitude},${longitude}`;map.setAttribute("aria-disabled","false");}
        locationStatus("Live location active","Location is updating in this browser only; coordinates are not uploaded.","active");
      },err=>{
        const messages={1:"Permission denied. Allow location access in Edge/Chrome site settings.",2:"Location unavailable. Check Windows Location Services or device GPS.",3:"Location timed out. Try again."};
        stopLocation(false); locationStatus("Could not get location",messages[err.code]||"Please try again.","error");
      },{enableHighAccuracy:true,maximumAge:2000,timeout:20000});
    });
    stop.addEventListener("click",()=>stopLocation());
    if(map) map.addEventListener("click",e=>{if(!latestPosition){e.preventDefault();locationStatus("No location yet","Start live location first.");}});
    window.addEventListener("beforeunload",()=>stopLocation(false));
  }

  function init(){
    const refresh=$("sg-refresh-history"), csv=$("sg-download-csv");
    if(refresh) refresh.addEventListener("click",loadSessions);
    if(csv) csv.addEventListener("click",downloadCSV);
    setupProfileSettings(); setupLocation();
    renderHistory(); renderWeeklyAnalytics(); loadSessions();
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();
