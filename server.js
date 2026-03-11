const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["https://webwars.online", "https://www.webwars.online", "https://webwars.onrender.com"],
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));

const CONFIG = {
    worldSize: 3000, foodCount: 120, buffCount: 8, botCount: 12,
    tickRate: 33, webSpeed: 12, webCooldown: 1200,
    webDamage: 0.18, webDamageCharged: 0.45,
    eatSizeRatio: 0.75, botWebRange: 350, botChaseRange: 400, botFleeRatio: 0.6,
    maxWebCount: 100, // Performans: Max web sayısı
    maxPlayerSize: 200, // Max oyuncu boyutu
    maxBotSize: 150 // Max bot boyutu
};
const COLORS = ['#9600ff','#00e5a0','#ff3366','#ffaa00','#00aaff','#ff6600','#cc00ff','#00ffcc'];
const BUFF_KEYS = ['TRIPLE_SHOT','SPEED','GIANT','RAPID_FIRE'];
const BOT_NAMES = ['Örümcek','Zehir','Karanlık','Ağ Ustası','Gölge','Avcı','Canavar','Kaos','Fırtına','Yırtıcı','Titan','Kobra'];

let players = {}, bots = {}, webs = [], foods = [], buffItems = [], rooms = {};

function randInt(a,b){return Math.floor(Math.random()*(b-a+1))+a}
function randFloat(a,b){return Math.random()*(b-a)+a}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function uid(){return Math.random().toString(36).substr(2,9)}

function createFood(){return{id:uid(),x:randInt(50,CONFIG.worldSize-50),y:randInt(50,CONFIG.worldSize-50),size:randInt(5,12),color:COLORS[randInt(0,COLORS.length-1)]}}
function createBuff(){return{id:uid(),x:randInt(100,CONFIG.worldSize-100),y:randInt(100,CONFIG.worldSize-100),type:BUFF_KEYS[randInt(0,BUFF_KEYS.length-1)],size:18}}

for(let i=0;i<CONFIG.foodCount;i++)foods.push(createFood());
for(let i=0;i<CONFIG.buffCount;i++)buffItems.push(createBuff());

function createBot(idx){
    const id='bot_'+uid();
    return{id,isBot:true,name:BOT_NAMES[idx%BOT_NAMES.length],x:randInt(200,CONFIG.worldSize-200),y:randInt(200,CONFIG.worldSize-200),size:randInt(20,45),color:COLORS[randInt(0,COLORS.length-1)],score:0,alive:true,speed:randFloat(1.8,3.0),targetX:randInt(100,CONFIG.worldSize-100),targetY:randInt(100,CONFIG.worldSize-100),lastWeb:0,webCooldown:randInt(1500,3500),wanderTimer:0,vx:0,vy:0};
}
for(let i=0;i<CONFIG.botCount;i++){const b=createBot(i);bots[b.id]=b;}

function updateBot(bot){
    if(!bot.alive)return;
    const now=Date.now();
    const all=[...Object.values(players),...Object.values(bots)].filter(e=>e.alive&&e.id!==bot.id);

    // Dodge webs
    const danger=webs.find(w=>w.ownerId!==bot.id&&dist(bot,w)<90);
    if(danger){
        const px=-danger.dy,py=danger.dx,n=Math.hypot(px,py)||1;
        bot.x=clamp(bot.x+(px/n)*bot.speed*2,bot.size,CONFIG.worldSize-bot.size);
        bot.y=clamp(bot.y+(py/n)*bot.speed*2,bot.size,CONFIG.worldSize-bot.size);
        return;
    }

    bot.wanderTimer--;
    if(bot.wanderTimer<=0){
        const threat=all.find(e=>dist(bot,e)<300&&e.size>bot.size*CONFIG.botFleeRatio);
        if(threat){
            const dx=bot.x-threat.x,dy=bot.y-threat.y,d=Math.hypot(dx,dy)||1;
            bot.targetX=clamp(bot.x+(dx/d)*400,100,CONFIG.worldSize-100);
            bot.targetY=clamp(bot.y+(dy/d)*400,100,CONFIG.worldSize-100);
        } else {
            const prey=all.filter(e=>e.size<bot.size*CONFIG.eatSizeRatio&&dist(bot,e)<CONFIG.botChaseRange).sort((a,b)=>dist(bot,a)-dist(bot,b))[0];
            if(prey){bot.targetX=prey.x;bot.targetY=prey.y;}
            else{
                const nf=foods.sort((a,b)=>dist(bot,a)-dist(bot,b))[0];
                if(nf){bot.targetX=nf.x;bot.targetY=nf.y;}
                else{bot.targetX=randInt(100,CONFIG.worldSize-100);bot.targetY=randInt(100,CONFIG.worldSize-100);}
            }
        }
        bot.wanderTimer=randInt(25,70);
    }

    const dx=bot.targetX-bot.x,dy=bot.targetY-bot.y,d=Math.hypot(dx,dy);
    if(d>2){
        const spd=bot.speed*(30/Math.max(bot.size,10));
        const mx=(dx/d)*Math.min(spd,d),my=(dy/d)*Math.min(spd,d);
        bot.x+=mx;bot.y+=my;bot.vx=mx;bot.vy=my;
    }
    bot.x=clamp(bot.x,bot.size,CONFIG.worldSize-bot.size);
    bot.y=clamp(bot.y,bot.size,CONFIG.worldSize-bot.size);

    // Shoot
    if(now-bot.lastWeb>bot.webCooldown){
        const t=all.filter(e=>dist(bot,e)<CONFIG.botWebRange).sort((a,b)=>dist(bot,a)-dist(bot,b))[0];
        if(t){
            const a=Math.atan2(t.y-bot.y,t.x-bot.x);
            webs.push({id:uid(),ownerId:bot.id,color:bot.color,x:bot.x,y:bot.y,vx:Math.cos(a)*CONFIG.webSpeed,vy:Math.sin(a)*CONFIG.webSpeed,dx:Math.cos(a),dy:Math.sin(a),size:10,damage:CONFIG.webDamage,charged:false,life:1.0});
            bot.lastWeb=now;
        }
    }

    // Eat food
    foods.filter(f=>dist(bot,f)<bot.size+f.size).forEach(f=>{
        bot.size=Math.min(CONFIG.maxBotSize, bot.size+f.size*0.1);bot.score+=2;
        const i=foods.indexOf(f);if(i!==-1){foods.splice(i,1);foods.push(createFood());}
    });

    // Eat entities
    all.forEach(e=>{
        if(!e.alive||dist(bot,e)>=bot.size||e.size>=bot.size*CONFIG.eatSizeRatio)return;
        bot.size=Math.min(CONFIG.maxBotSize, bot.size+e.size*0.3);bot.score+=Math.floor(e.size*10);e.alive=false;
        if(e.isBot){setTimeout(()=>{const nb=createBot(0);bots[nb.id]=nb;delete bots[e.id];},5000);}
        else{io.to(e.id).emit('killedByBot',{killerName:bot.name});}
    });
}

function updateWebs(){
    const all=[...Object.values(players),...Object.values(bots)].filter(e=>e.alive);
    webs=webs.filter(web=>{
        web.x+=web.vx;web.y+=web.vy;web.life-=0.008;
        if(web.life<=0||web.x<0||web.x>CONFIG.worldSize||web.y<0||web.y>CONFIG.worldSize)return false;
        for(const t of all){
            if(t.id===web.ownerId)continue;
            if(dist(web,t)<t.size+web.size){
                t.size=Math.max(15,t.size*(1-web.damage));
                if(players[web.ownerId]){players[web.ownerId].score+=20;io.to(web.ownerId).emit('webHitConfirm',{targetId:t.id,megaGain:18});}
                if(!t.isBot)io.to(t.id).emit('tookDamage',{newSize:t.size});
                return false;
            }
        }
        return true;
    });
}

function gameTick(){
    Object.values(bots).forEach(updateBot);
    updateWebs();
    const botsArr=Object.values(bots).filter(b=>b.alive).map(b=>({id:b.id,name:b.name,x:b.x,y:b.y,size:b.size,color:b.color,score:b.score,isBot:true}));
    const playersArr=Object.values(players).filter(p=>p.alive).map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,size:p.size,color:p.color,score:p.score}));
    io.emit('tick',{players:playersArr,bots:botsArr,webs:webs.map(w=>({id:w.id,ownerId:w.ownerId,x:w.x,y:w.y,color:w.color,size:w.size,charged:w.charged}))});
}
setInterval(gameTick,CONFIG.tickRate);

io.on('connection',(socket)=>{
    console.log('Connected:',socket.id);
    
    // Ping handler
    socket.on('ping', () => {
        socket.emit('pong');
    });

    socket.on('join',(data)=>{
        players[socket.id]={id:socket.id,name:data.name||'Oyuncu',x:CONFIG.worldSize/2+randInt(-300,300),y:CONFIG.worldSize/2+randInt(-300,300),size:30,color:data.color||COLORS[randInt(0,COLORS.length-1)],score:0,alive:true,vx:0,vy:0};
        socket.emit('init',{id:socket.id,player:players[socket.id],foods,buffItems,bots:Object.values(bots)});
        io.emit('onlineCount',Object.keys(players).length);
    });

    socket.on('move',(data)=>{
        const p=players[socket.id];if(!p||!p.alive)return;
        p.x=clamp(data.x,p.size,CONFIG.worldSize-p.size);
        p.y=clamp(data.y,p.size,CONFIG.worldSize-p.size);
        p.size=Math.min(CONFIG.maxPlayerSize, data.size);p.score=data.score;p.vx=data.vx||0;p.vy=data.vy||0;
    });

    socket.on('webShot',(data)=>{
        const p=players[socket.id];if(!p||!p.alive)return;
        // Performans: Max web limiti
        if(webs.length >= CONFIG.maxWebCount) return;
        const angle=data.angle,charged=data.charged||false,spd=charged?CONFIG.webSpeed*0.7:CONFIG.webSpeed;
        const offsets=data.triple?[0,0.25,-0.25]:[0];
        offsets.forEach((off,i)=>{
            setTimeout(()=>{
                webs.push({id:uid(),ownerId:socket.id,color:p.color,x:p.x,y:p.y,vx:Math.cos(angle+off)*spd,vy:Math.sin(angle+off)*spd,dx:Math.cos(angle+off),dy:Math.sin(angle+off),size:charged?28:10,damage:charged?CONFIG.webDamageCharged:CONFIG.webDamage,charged,life:charged?1.5:1.0});
            },i*100);
        });
    });

    socket.on('ateFood',(foodId)=>{
        const i=foods.findIndex(f=>f.id===foodId);
        if(i!==-1){foods.splice(i,1);const nf=createFood();foods.push(nf);io.emit('foodUpdate',{removed:foodId,added:nf});}
    });

    socket.on('ateBuff',(buffId)=>{
        const i=buffItems.findIndex(b=>b.id===buffId);
        if(i!==-1){const type=buffItems[i].type;buffItems.splice(i,1);const nb=createBuff();buffItems.push(nb);io.emit('buffUpdate',{removed:buffId,added:nb});socket.emit('buffGranted',{type});}
    });

    socket.on('atePlayer',(targetId)=>{
        const p=players[socket.id],t=players[targetId];
        if(!p||!t||!t.alive)return;
        if(p.size>=t.size*CONFIG.eatSizeRatio){t.alive=false;p.size+=t.size*0.3;p.score+=Math.floor(t.size*10);io.to(targetId).emit('killedByPlayer',{killerName:p.name});}
    });

    socket.on('died',()=>{if(players[socket.id])players[socket.id].alive=false;});
    socket.on('revived',()=>{const p=players[socket.id];if(p){p.alive=true;p.size=Math.max(20,p.size*0.5);}});

    socket.on('createRoom',({code})=>{rooms[code]={code,players:[socket.id]};socket.join('room_'+code);socket.emit('roomUpdate',{code,count:1});});
    socket.on('joinRoom',({code})=>{
        if(!rooms[code]){socket.emit('roomError','Oda bulunamadı!');return;}
        rooms[code].players.push(socket.id);socket.join('room_'+code);
        io.to('room_'+code).emit('roomUpdate',{code,count:rooms[code].players.length});
    });

    socket.on('disconnect',()=>{
        console.log('Disconnected:',socket.id);
        delete players[socket.id];
        io.emit('playerLeft',socket.id);
        io.emit('onlineCount',Object.keys(players).length);
        Object.keys(rooms).forEach(code=>{
            rooms[code].players=rooms[code].players.filter(id=>id!==socket.id);
            if(rooms[code].players.length===0)delete rooms[code];
        });
    });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`WebWars server on port ${PORT}`));
