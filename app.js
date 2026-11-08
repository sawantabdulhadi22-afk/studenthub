/* StudentHub frontend - Supabase Auth + student dashboard */
const cfg = window.STUDENTHUB_CONFIG || {};
const configured = cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY &&
  !cfg.SUPABASE_URL.includes("PASTE_") && !cfg.SUPABASE_PUBLISHABLE_KEY.includes("PASTE_");
const sb = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY) : null;
let currentUser = null, currentProfile = null, currentAnswers = [], currentWatermark = false, currentJobId = null;
let selectedQuestionFile = null, selectedTemplateFile = null, usageToday = 0, savedItems = [], tasks = [];

const $ = id => document.getElementById(id);
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),3400)}
function setStatus(message, error=false){$("homeworkStatus").textContent=message;$("homeworkStatus").style.color=error?"#b04444":"#718096"}
function showAuth(which){["loginForm","signupForm","resetForm","newPasswordForm"].forEach(id=>$(id).classList.add("hidden"));$(which).classList.remove("hidden")}
function showApp(){ $("authScreen").classList.add("hidden");$("appShell").classList.remove("hidden"); }
function showAuthScreen(){ $("appShell").classList.add("hidden");$("authScreen").classList.remove("hidden"); }
function safeText(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function pageName(p){return ({dashboard:"Dashboard",resources:"Study resources",homework:"AI Homework Writer",planner:"Study planner",library:"My library",progress:"Progress",membership:"Membership",profile:"My profile",admin:"Admin dashboard"})[p]||"Dashboard"}
function navigate(page){
  if(page==="admin" && currentProfile?.role!=="admin"){toast("Admin access only.");return}
  document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));
  const target=$("page-"+page);if(target)target.classList.add("active");
  document.querySelectorAll(".nav-item[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===page));
  $("topPageTitle").textContent=pageName(page);$("sidebar").classList.remove("open");
  if(page==="library")renderLibrary();if(page==="planner")renderTasks();if(page==="progress")refreshStats();
}
async function loadProfile(){
  const {data,error}=await sb.from("profiles").select("*").eq("id",currentUser.id).maybeSingle();
  if(error) console.warn(error);
  currentProfile=data||{id:currentUser.id,full_name:currentUser.user_metadata?.full_name||currentUser.email?.split("@")[0],plan:"free",role:"student"};
  $("topName").textContent=currentProfile.full_name||"Student";$("welcomeName").textContent=(currentProfile.full_name||"Student").split(" ")[0];
  $("avatar").textContent=($("welcomeName").textContent[0]||"S").toUpperCase();$("profileAvatar").textContent=$("avatar").textContent;
  $("topPlan").textContent=(currentProfile.plan||"free").toUpperCase()+" PLAN";$("sidePlan").textContent=(currentProfile.plan||"free").toUpperCase()+" plan";
  $("sideUsage").textContent=currentProfile.plan==="pro"?"Higher fair-use limit":"2 homework PDFs daily";
  $("planStat").textContent=(currentProfile.plan||"free").toUpperCase();
  $("adminNav").classList.toggle("hidden",currentProfile.role!=="admin");
  $("profileName").value=currentProfile.full_name||"";$("profileEmail").value=currentUser.email||"";$("profileEducation").value=currentProfile.education||"";
}
async function refreshUsage(){
  if(!sb||!currentUser)return;
  const indiaNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  indiaNow.setHours(0,0,0,0);
  const indiaDayStart = new Date(indiaNow.getTime() - (5.5 * 60 * 60 * 1000)).toISOString();
  const {data,error}=await sb.from("homework_jobs").select("id,created_at,status").eq("user_id",currentUser.id).gte("created_at",indiaDayStart).in("status",["processing","completed"]);
  if(!error)usageToday=data.length;
  $("pdfCount").textContent=currentProfile?.plan==="pro"?`${usageToday} / 50`:`${usageToday} / 2`;
  $("homeworkUsage").textContent=currentProfile?.plan==="pro"?"Pro plan: higher fair-use generation limit. No StudentHub watermark.":"Free plan: 2 completed PDFs per day. Your second PDF includes a StudentHub watermark.";
}
async function refreshStats(){
  const saved=savedItems.length, done=tasks.filter(t=>t.done).length;
  ["savedCount","progressSaved"].forEach(id=>$(id).textContent=saved);
  $("taskCount").textContent=tasks.filter(t=>!t.done).length;
  $("progressTasks").textContent=done;$("progressPdfs").textContent=usageToday;$("progressPdfs").textContent=usageToday;
}
async function loadPrivateData(){
  const [s,t]=await Promise.all([
    sb.from("saved_items").select("*").eq("user_id",currentUser.id).order("created_at",{ascending:false}),
    sb.from("study_tasks").select("*").eq("user_id",currentUser.id).order("created_at",{ascending:false})
  ]);
  savedItems=s.data||[];tasks=t.data||[];renderTasks();renderLibrary();refreshStats();await refreshUsage();
}
async function enterApp(user){
  currentUser=user;showApp();await loadProfile();await loadPrivateData();
  $("todayDate").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short",year:"numeric"});
}
function setupAuth(){
  $("showSignup").onclick=()=>showAuth("signupForm");$("showLogin").onclick=()=>showAuth("loginForm");
  $("forgotLink").onclick=()=>{showAuth("resetForm");$("resetEmail").value=$("loginEmail").value};
  $("backToLogin").onclick=()=>showAuth("loginForm");
  $("signInForm").onsubmit=async e=>{e.preventDefault();if(!sb)return toast("Add your Supabase URL and publishable key in config.js first.");
    const {data,error}=await sb.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
    if(error)return toast(error.message);await enterApp(data.user);toast("Welcome back!")};
  $("registerForm").onsubmit=async e=>{e.preventDefault();if(!sb)return toast("Configure Supabase first.");
    const name=$("signupName").value.trim(),email=$("signupEmail").value.trim(),pass=$("signupPassword").value;
    if(pass!==$("signupConfirm").value)return toast("Passwords do not match.");
    const {data,error}=await sb.auth.signUp({email,password:pass,options:{data:{full_name:name},emailRedirectTo:location.origin+location.pathname}});
    if(error)return toast(error.message);
    if(data.session){await enterApp(data.user);toast("Account created.");}
    else toast("Account created. Check your email to verify it, then log in.");
  };
  $("resetPasswordForm").onsubmit=async e=>{e.preventDefault();if(!sb)return toast("Configure Supabase first.");
    const {error}=await sb.auth.resetPasswordForEmail($("resetEmail").value.trim(),{redirectTo:location.origin+location.pathname});
    if(error)return toast(error.message);toast("Password reset email sent.")};
  $("updatePasswordForm").onsubmit=async e=>{e.preventDefault();const {error}=await sb.auth.updateUser({password:$("newPassword").value});if(error)return toast(error.message);toast("Password updated.");showAuth("loginForm")};
  $("logoutBtn").onclick=async()=>{await sb.auth.signOut();currentUser=null;showAuthScreen();showAuth("loginForm")};
}
function setupNavigation(){
  document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.page)));
  document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.go)));
  $("menuBtn").onclick=()=>$("sidebar").classList.toggle("open");
}
const branches={
  "Diploma":["Mechanical Engineering","Civil Engineering","Computer Engineering","Electrical Engineering","Automobile Engineering"],
  "Class 11":["Science - PCM","Science - PCB","Commerce","Arts"],
  "Class 12":["Science - PCM","Science - PCB","Commerce","Arts"],
  "B.Tech":["Computer Science","Mechanical Engineering","Civil Engineering","Electrical Engineering","Electronics & Communication"],
  "ITI":["Fitter","Electrician","Welder","Turner","Mechanic Motor Vehicle"]
};
const boards={"Diploma":["MSBTE Maharashtra","BTEUP Uttar Pradesh","DTE Karnataka","TNDOTE Tamil Nadu","WBSCTE West Bengal","Other Board"],"Class 11":["Maharashtra State Board","CBSE","ISC","Other Board"],"Class 12":["Maharashtra State Board","CBSE","ISC","Other Board"],"B.Tech":["University / Autonomous","Mumbai University","SPPU Pune","Other University"],"ITI":["NCVT","SCVT","Other Board"]};
const subjects={
"Mechanical Engineering":["Engineering Mathematics","Applied Physics","Applied Chemistry","Engineering Graphics","Workshop Practice","Strength of Materials","Fluid Mechanics","Manufacturing Technology","Automobile Engineering","Theory of Machines"],
"Civil Engineering":["Engineering Mathematics","Applied Physics","Engineering Graphics","Building Materials","Surveying","Strength of Materials","Fluid Mechanics","Concrete Technology"],
"Computer Engineering":["Engineering Mathematics","Applied Physics","Programming in C","Computer Fundamentals","Data Structures","Database Management","Computer Networks","Web Technology"],
"Electrical Engineering":["Engineering Mathematics","Applied Physics","Basic Electrical Engineering","Electrical Machines","Power Systems","Measurements","Electronics"],
"Automobile Engineering":["Engineering Mathematics","Applied Physics","Automobile Engines","Vehicle Chassis","Automotive Transmission","Vehicle Maintenance","Automobile Electrical Systems"],
"Science - PCM":["Physics","Chemistry","Mathematics","English","Computer Science"],
"Science - PCB":["Physics","Chemistry","Biology","English","Environmental Education"],
"Commerce":["Accountancy","Economics","Business Studies","Mathematics","English"],
"Arts":["History","Geography","Political Science","Psychology","Sociology","English"],
"Computer Science":["Engineering Mathematics","Programming","Data Structures","Database Systems","Operating Systems","Computer Networks"],
"Fitter":["Workshop Calculation","Engineering Drawing","Fitting","Welding","Safety"],
"Electrician":["Electrical Fundamentals","Wiring","Electrical Machines","Measurements","Safety"],
"Welder":["Welding Technology","Engineering Drawing","Workshop Calculation","Safety"],
"Turner":["Turning Operations","Engineering Drawing","Workshop Calculation","Machine Tools"],
"Mechanic Motor Vehicle":["Automobile Engines","Vehicle Systems","Workshop Practice","Electrical Systems"]
};
function fillSelect(id,items,placeholder){const s=$(id);s.innerHTML=`<option value="">${placeholder}</option>`;(items||[]).forEach(x=>s.add(new Option(x,x)))}
function updateEducation(){
  const c=$("course").value;fillSelect("board",boards[c],"Select board");fillSelect("branch",branches[c],"Select stream or branch");fillSelect("term",[],"Select semester or year");fillSelect("subject",[],"Select subject");
  $("resourceTitle").textContent="Choose a subject first";$("resourceGrid").innerHTML="";$("selectionMessage").textContent="Select your education details to continue.";
}
function updateBranch(){
  const c=$("course").value,b=$("branch").value;
  fillSelect("term",c==="Diploma"?["Semester 1","Semester 2","Semester 3","Semester 4","Semester 5","Semester 6"]:c==="Class 11"?["Class 11"]:c==="Class 12"?["Class 12"]:c==="B.Tech"?["Year 1","Year 2","Year 3","Year 4"]:["Year 1","Year 2"],"Select semester or year");
  fillSelect("subject",subjects[b]||[],"Select subject");renderResourceCards();
}
function updateTerm(){fillSelect("subject",subjects[$("branch").value]||[],"Select subject");renderResourceCards()}
const resourceTypes=[
  ["Notes","▤","Chapter-wise explanations and revision notes."],
  ["Important Questions","✦","Short and long-answer practice questions."],
  ["Previous Year Questions","▣","PYQ collection. Official papers must be added and verified by the admin."],
  ["Solved Answers","✎","Structured descriptive answers and explanations."],
  ["MCQ Practice","☷","Multiple-choice questions with explanations."],
  ["Numericals","∑","Step-by-step numerical practice."],
  ["Diagrams","◇","Subject diagrams and labelled illustrations."],
  ["Formula Sheet","ƒ","Important formulas and units."]
];
function renderResourceCards(){
  const subject=$("subject").value,grid=$("resourceGrid");
  if(!subject){grid.innerHTML="";return}
  $("resourceTitle").textContent=subject+" resources";$("selectionMessage").textContent=`Selected: ${$("course").value} · ${$("branch").value} · ${$("term").value||"Term not selected"} · ${subject}`;
  grid.innerHTML=resourceTypes.map(([name,icon,desc])=>`<article class="resource-card"><span class="res-icon">${icon}</span><h3>${name}</h3><p>${desc}</p><div class="resource-actions"><button class="small-btn" data-resource="${safeText(name)}">Open</button><button class="small-btn" data-save="${safeText(name)}">☆ Save</button></div></article>`).join("");
  grid.querySelectorAll("[data-resource]").forEach(b=>b.onclick=()=>openResource(b.dataset.resource,subject));
  grid.querySelectorAll("[data-save]").forEach(b=>b.onclick=()=>saveResource(b.dataset.save,subject));
}
function sampleContent(type,subject){
  const samples={
    "Notes":`<p><b>${safeText(subject)}</b></p><p>This is a starter resource area. Add your verified chapter notes from the Admin content workflow before publishing.</p><p>Use clear definitions, key concepts, worked examples and a short revision summary for each chapter.</p>`,
    "Important Questions":`<ol><li>Define the main concept of the selected chapter.</li><li>Explain its working principle with a neat labelled diagram.</li><li>State two applications and two advantages.</li></ol><p class="muted">These are sample practice prompts, not official PYQs.</p>`,
    "Previous Year Questions":`<p>No verified official PYQ has been uploaded for this subject yet.</p><p>Admin should upload authentic board/university papers and label the exam year and scheme.</p>`,
    "Solved Answers":`<p><b>Answer-writing format</b></p><ol><li>Write the definition.</li><li>Explain the principle or construction.</li><li>Add a labelled diagram if required.</li><li>Write applications or conclusion.</li></ol><p class="muted">Sample structure only. Subject-specific solved answers need to be added.</p>`,
    "MCQ Practice":`<p><b>Sample question:</b> Why should a student revise a topic after learning it?</p><ol type="A"><li>To improve recall</li><li>To avoid practice</li><li>To skip understanding</li><li>To memorise without context</li></ol><p><b>Correct answer:</b> A — spaced revision can strengthen recall.</p>`,
    "Numericals":`<p>Add chapter-wise numerical problems with known values, formula, substitution, calculation and final unit.</p>`,
    "Diagrams":`<p>Upload clear, labelled diagrams for this subject in the Admin content area.</p>`,
    "Formula Sheet":`<p>Add verified formulas, symbol meanings, SI units and a short example for each chapter.</p>`
  };return samples[type]||"<p>Content not available yet.</p>";
}
function openResource(type,subject){$("resourcePreview").classList.remove("hidden");$("previewTitle").textContent=type+" · "+subject;$("previewBody").innerHTML=sampleContent(type,subject);$("resourcePreview").scrollIntoView({behavior:"smooth",block:"start"})}
$("closePreview").onclick=()=>$("resourcePreview").classList.add("hidden");
async function saveResource(type,subject){
  const item={title:type,subject,course:$("course").value,branch:$("branch").value};
  if(savedItems.some(x=>x.title===item.title&&x.subject===item.subject)){toast("Already saved.");return}
  const {data,error}=await sb.from("saved_items").insert({user_id:currentUser.id,title:item.title,subject:item.subject,details:item}).select().single();
  if(error)return toast(error.message);savedItems.unshift(data);renderLibrary();refreshStats();toast("Saved to your library.");
}
function renderLibrary(){
  const el=$("libraryList");if(!savedItems.length){el.innerHTML='<div class="panel muted">No saved resources yet. Open Study resources and press Save.</div>';return}
  el.innerHTML=savedItems.map(x=>`<article class="resource-card"><span class="res-icon">☆</span><h3>${safeText(x.title)}</h3><p>${safeText(x.subject||"")}</p><button class="small-btn" data-remove="${x.id}">Remove</button></article>`).join("");
  el.querySelectorAll("[data-remove]").forEach(b=>b.onclick=async()=>{const {error}=await sb.from("saved_items").delete().eq("id",b.dataset.remove);if(error)return toast(error.message);savedItems=savedItems.filter(x=>x.id!==b.dataset.remove);renderLibrary();refreshStats()});
}
async function addTask(title,due){
  const {data,error}=await sb.from("study_tasks").insert({user_id:currentUser.id,title,due_date:due||null}).select().single();
  if(error)return toast(error.message);tasks.unshift(data);renderTasks();refreshStats();
}
function renderTasks(){
  const el=$("taskList");if(!tasks.length){el.innerHTML='<p class="muted tiny">No tasks yet. Add your first study task.</p>';return}
  el.innerHTML=tasks.map(t=>`<div class="task-row ${t.is_done?"done":""}"><input type="checkbox" data-task="${t.id}" ${t.is_done?"checked":""}><span class="task-text">${safeText(t.title)}</span><small>${t.due_date?safeText(t.due_date):""}</small><button class="small-btn" data-delete-task="${t.id}">×</button></div>`).join("");
  el.querySelectorAll("[data-task]").forEach(c=>c.onchange=async()=>{const {error}=await sb.from("study_tasks").update({is_done:c.checked}).eq("id",c.dataset.task);if(error)return toast(error.message);const t=tasks.find(x=>x.id===c.dataset.task);t.is_done=c.checked;renderTasks();refreshStats()});
  el.querySelectorAll("[data-delete-task]").forEach(b=>b.onclick=async()=>{const {error}=await sb.from("study_tasks").delete().eq("id",b.dataset.deleteTask);if(error)return toast(error.message);tasks=tasks.filter(x=>x.id!==b.dataset.deleteTask);renderTasks();refreshStats()});
}
$("taskForm").onsubmit=async e=>{e.preventDefault();await addTask($("taskInput").value.trim(),$("taskDate").value);$("taskInput").value="";$("taskDate").value=""};
$("saveProfile").onclick=async()=>{const {error}=await sb.from("profiles").update({full_name:$("profileName").value.trim(),education:$("profileEducation").value||null}).eq("id",currentUser.id);if(error)return toast(error.message);await loadProfile();toast("Profile updated.")};

async function extractPdfText(file){
  if(!window.pdfjsLib)throw new Error("PDF reader did not load. Paste your questions manually.");
  pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const bytes=await file.arrayBuffer(),pdf=await pdfjsLib.getDocument({data:bytes}).promise;let text="";
  for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),content=await page.getTextContent();text+=content.items.map(x=>x.str).join(" ")+"\n"}
  return text.trim();
}
$("questionPdf").onchange=e=>{selectedQuestionFile=e.target.files[0]||null;$("questionFileName").textContent=selectedQuestionFile?selectedQuestionFile.name:"No assignment selected"};
$("paperTemplate").onchange=e=>{selectedTemplateFile=e.target.files[0]||null;$("paperFileName").textContent=selectedTemplateFile?selectedTemplateFile.name:"No paper template selected"};
function renderAnswers(){
  const box=$("answerPreview");if(!currentAnswers.length){box.classList.add("empty-state");box.textContent="Your answer draft will appear here.";return}
  box.classList.remove("empty-state");box.innerHTML=currentAnswers.map((a,i)=>`<div class="answer-block"><b>${i+1}. ${safeText(a.question)}</b><div contenteditable="true" data-answer="${i}">${safeText(a.answer)}</div></div>`).join("");
  box.querySelectorAll("[data-answer]").forEach(el=>el.addEventListener("input",()=>{currentAnswers[Number(el.dataset.answer)].answer=el.innerText}));
}
async function generateHomework(){
  if(!sb||!currentUser)return toast("Please log in first.");
  let questionText=$("questionText").value.trim();
  try{if(!questionText&&selectedQuestionFile)questionText=await extractPdfText(selectedQuestionFile)}catch(e){return setStatus(e.message,true)}
  if(!questionText)return setStatus("Upload a text-based PDF or paste the questions first.",true);
  if(questionText.length>18000)return setStatus("Please keep the extracted assignment text under 18,000 characters.",true);
  if(!selectedTemplateFile)return setStatus("Upload a blank paper PDF or image template first.",true);
  $("generateHomework").disabled=true;setStatus("Preparing your answer draft...");
  try{
    let templateData=await selectedTemplateFile.arrayBuffer(),templateType=selectedTemplateFile.type;
    const {data,error}=await sb.functions.invoke("generate-homework",{body:{questions:questionText,detail:$("answerDetail").value}});
    if(error)throw error;
    if(!data?.answers?.length)throw new Error("The AI did not return any answers.");
    currentAnswers=data.answers;currentWatermark=!!data.watermark;currentJobId=data.job_id;selectedTemplateFile._bytes=templateData;selectedTemplateFile._type=templateType;
    renderAnswers();$("exportHomework").disabled=false;
    setStatus(`Draft ready. ${currentWatermark?"This is your second Free PDF today and will include a StudentHub watermark.":"Review your answers, then export your PDF."}`);
    await refreshUsage();
  }catch(e){console.error(e);setStatus(e.message||"Could not generate answers. Check the Edge Function and AI secret setup.",true)}
  finally{$("generateHomework").disabled=false}
}
$("generateHomework").onclick=generateHomework;

async function exportHomework(){
  if(!currentAnswers.length||!selectedTemplateFile?._bytes)return;
  const {PDFDocument,StandardFonts,rgb,degrees}=PDFLib;
  const bytes=selectedTemplateFile._bytes,type=selectedTemplateFile._type;
  let templateDoc;
  if(type==="application/pdf")templateDoc=await PDFDocument.load(bytes);
  else{
    templateDoc=await PDFDocument.create();const page=templateDoc.addPage([595,842]);
    const img=type==="image/png"?await templateDoc.embedPng(bytes):await templateDoc.embedJpg(bytes);
    const scale=Math.min(page.getWidth()/img.width,page.getHeight()/img.height);
    page.drawImage(img,{x:(page.getWidth()-img.width*scale)/2,y:(page.getHeight()-img.height*scale)/2,width:img.width*scale,height:img.height*scale});
  }
  const out=await PDFDocument.create(),font=await out.embedFont($("writingStyle").value==="italic"?StandardFonts.TimesRomanItalic:StandardFonts.TimesRoman);
  const ink=$("inkColour").value==="blue"?rgb(.08,.18,.52):rgb(.08,.08,.08);
  const templatePages=templateDoc.getPages();
  const answers=currentAnswers;
  for(let i=0;i<answers.length;i++){
    const source=templatePages[Math.min(i,templatePages.length-1)];
    const [page]=await out.copyPages(templateDoc,[templatePages.indexOf(source)]);out.addPage(page);
    const {width,height}=page.getSize();const margin=62;let y=height-95;
    const text=`${i+1}. ${answers[i].question}\n${answers[i].answer}`;
    const words=text.split(/\s+/);let lines=[],line="";
    for(const word of words){const next=line?line+" "+word:word;if(font.widthOfTextAtSize(next,11)>width-margin*2){lines.push(line);line=word}else line=next}
    if(line)lines.push(line);
    for(const ln of lines){if(y<55){break}page.drawText(ln,{x:margin,y,size:11,font,color:ink});y-=18}
    if(currentWatermark)page.drawText("STUDENTHUB",{x:width*.18,y:height*.43,size:42,font:await out.embedFont(StandardFonts.HelveticaBold),color:rgb(.82,.82,.82),opacity:.25,rotate:degrees(-32)});
    page.drawText("Prepared with StudentHub · Please review before submission",{x:margin,y:28,size:7,font:await out.embedFont(StandardFonts.Helvetica),color:rgb(.55,.55,.55)});
  }
  const pdfBytes=await out.save(),blob=new Blob([pdfBytes],{type:"application/pdf"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="StudentHub-Homework-Draft.pdf";a.click();URL.revokeObjectURL(url);toast("PDF downloaded. Please review it before printing.");
}
$("exportHomework").onclick=()=>exportHomework().catch(e=>{console.error(e);toast("PDF export failed: "+e.message)});

function setupEducation(){ $("course").onchange=updateEducation;$("board").onchange=updateBranch;$("branch").onchange=updateBranch;$("term").onchange=updateTerm;$("subject").onchange=renderResourceCards(); }
async function boot(){
  setupAuth();setupNavigation();
  $("course").onchange=updateEducation;$("board").onchange=updateBranch;$("branch").onchange=updateBranch;$("term").onchange=updateTerm;$("subject").onchange=renderResourceCards;
  if(!configured){showAuthScreen();toast("Setup needed: add your Supabase project details in config.js.");return}
  const {data:{session}}=await sb.auth.getSession();
  if(session?.user)await enterApp(session.user);else showAuthScreen();
  sb.auth.onAuthStateChange(async(event,session)=>{
    if(event==="PASSWORD_RECOVERY"){showAuthScreen();showAuth("newPasswordForm")}
    else if(event==="SIGNED_OUT"){showAuthScreen()}
  });
}
boot();
