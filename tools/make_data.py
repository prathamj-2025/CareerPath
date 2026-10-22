# Deterministic TuneBox dataset (fictional music streaming app). Writes tunebox.db and CSVs.
import random, sqlite3, csv, os, datetime as dt
random.seed(531)
D = dt.date
START, END = D(2026,1,1), D(2026,6,30)
def rd(a,b): return a + dt.timedelta(days=random.randint(0,(b-a).days))
artists=[]
anames=["Luna Park","Neon Harbor","Quiet Rivers","Atlas Kid","Velvet Static","Mira Solis","The Paper Kites Club","Orbit Seven","Coral Echo","Hollow Pines","DJ Marlow","Sable Moon","Northern Lines","Pixel Heart","Ruby Tide","Gold Season","Echo Valley","Static Bloom","Midnight Ferry","Rosewood","Tiny Comets","Blue Lantern","Juno Vale","Kite & Compass","Saffron","Wild Cedar","Night Market","Aurora Bay","Slow Parade","Copper Sky"]
countries=["US","US","US","IN","IN","UK","BR","DE","CA","MX"]
for i,n in enumerate(anames,1): artists.append((i,n,random.choice(countries)))
genres=["pop","rock","hiphop","electronic","indie","jazz","latin"]
tracks=[]
for t in range(1,301):
    a=random.randint(1,len(artists)); g=random.choice(genres)
    tracks.append((t,f"Track {t:03d}",a,g,random.randint(120,320),str(rd(D(2023,1,1),D(2026,5,30)))))
users=[]
chan=["organic"]*40+["paid_social"]*25+["search_ads"]*15+["referral"]*20
plats=["ios"]*45+["android"]*40+["web"]*15
ages=["18-24"]*35+["25-34"]*40+["35-44"]*15+["45+"]*10
for u in range(1,3001):
    users.append([u,str(rd(START,D(2026,6,1))),random.choice(countries),random.choice(plats),random.choice(chan),random.choice(ages)])
udate={u[0]:dt.date.fromisoformat(u[1]) for u in users}
# subscriptions: premium conversions, higher for referral/organic, some churn
subs=[];sid=1;premium_now=set()
for u in users:
    uid=u[0]; p={"organic":.20,"referral":.28,"paid_social":.09,"search_ads":.14}[u[4]]
    if u[3]=="web": p*=.7
    if random.random()<p:
        s=udate[uid]+dt.timedelta(days=random.randint(2,45))
        if s>END: continue
        plan="family" if random.random()<.15 else "premium"
        price=16.99 if plan=="family" else 10.99
        end=None
        if random.random()<.35:
            e=s+dt.timedelta(days=random.randint(28,120))
            if e<=END: end=str(e)
        if end is None: premium_now.add(uid)
        subs.append((sid,uid,plan,str(s),end,price,"active" if end is None else "canceled")); sid+=1
for u in users: u.append("premium" if u[0] in premium_now else "free")
# listens
listens=[];lid=1
dev=["phone","phone","phone","desktop","speaker","tv"]
for u in users:
    uid=u[0]; heavy=random.random()
    n=int((random.expovariate(1/ (14 if heavy<.7 else 60)))* (1.4 if u[6]=="premium" else 1))
    n=min(n,260)
    for _ in range(n):
        d=udate[uid]+dt.timedelta(days=int(random.expovariate(1/35)))
        if d>END: continue
        ts=dt.datetime.combine(d,dt.time(random.choice([7,8,9,12,13,18,19,20,21,22,23]),random.randint(0,59),random.randint(0,59)))
        t=random.choice(tracks); played=random.randint(5,t[4])
        listens.append((lid,uid,t[0],str(ts),played,random.choice(dev))); lid+=1
# events
events=[];eid=1
names=["app_open"]*30+["search"]*15+["play"]*30+["skip"]*12+["add_to_playlist"]*7+["share"]*3+["upgrade_click"]*3
for u in users:
    uid=u[0]
    n=min(int(random.expovariate(1/22)),150)
    for _ in range(n):
        d=udate[uid]+dt.timedelta(days=int(random.expovariate(1/30)))
        if d>END: continue
        ts=dt.datetime.combine(d,dt.time(random.randint(6,23),random.randint(0,59),random.randint(0,59)))
        events.append((eid,uid,random.choice(names),str(ts),u[3])); eid+=1
# experiment: onboarding_v2, 50/50, conversion = premium within 14 days
exp=[]
for u in users:
    if udate[u[0]]>=D(2026,4,1):
        var=random.choice(["control","treatment"])
        p=.075 if var=="control" else .095
        exp.append((u[0],"onboarding_v2",var,str(udate[u[0]]),1 if random.random()<p else 0))
# support tickets
cats=["billing","playback","login","other"]
tick=[];tid=1
for u in users:
    if random.random()<.12:
        c=random.choice(cats)
        tick.append((tid,u[0],str(rd(udate[u[0]],END)),c,round(random.expovariate(1/ (30 if c=="billing" else 12)),1))); tid+=1
if os.path.exists("data/tunebox.db"): os.remove("data/tunebox.db")
con=sqlite3.connect("data/tunebox.db"); c=con.cursor()
schema={
 "users":("user_id INTEGER PRIMARY KEY, signup_date TEXT, country TEXT, platform TEXT, acquisition_channel TEXT, age_band TEXT, plan TEXT",users),
 "artists":("artist_id INTEGER PRIMARY KEY, artist_name TEXT, country TEXT",artists),
 "tracks":("track_id INTEGER PRIMARY KEY, title TEXT, artist_id INTEGER, genre TEXT, duration_sec INTEGER, release_date TEXT",tracks),
 "listens":("listen_id INTEGER PRIMARY KEY, user_id INTEGER, track_id INTEGER, listened_at TEXT, seconds_played INTEGER, device TEXT",listens),
 "events":("event_id INTEGER PRIMARY KEY, user_id INTEGER, event_name TEXT, event_time TEXT, platform TEXT",events),
 "subscriptions":("sub_id INTEGER PRIMARY KEY, user_id INTEGER, plan TEXT, start_date TEXT, end_date TEXT, price_usd REAL, status TEXT",subs),
 "experiment_assignments":("user_id INTEGER, experiment_id TEXT, variant TEXT, assigned_date TEXT, converted INTEGER",exp),
 "support_tickets":("ticket_id INTEGER PRIMARY KEY, user_id INTEGER, created_date TEXT, category TEXT, hours_to_resolve REAL",tick),
}
os.makedirs("data",exist_ok=True)
for name,(cols,rows) in schema.items():
    c.execute(f"CREATE TABLE {name} ({cols})")
    c.executemany(f"INSERT INTO {name} VALUES ({','.join('?'*len(cols.split(',')))})",rows)
    hdr=[x.strip().split()[0] for x in cols.split(",")]
    with open(f"data/{name}.csv","w",newline="") as f:
        w=csv.writer(f); w.writerow(hdr); w.writerows(rows)
    print(name,len(rows))
con.commit();con.close()
