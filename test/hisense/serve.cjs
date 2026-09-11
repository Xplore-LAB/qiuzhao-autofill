// Loopback-only, read-only allowlist. Never serves profiles, secrets or arbitrary workspace files.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const files=['content/content.js','test/repeat-records-harness.html','test/v1.4-harness.html','test/choice-verification-harness.html',...['index.html','controls.html','controls.js','dashboard.js','suite.css'].map(n=>'test/hisense/'+n)];
const allowed=new Set(files.map(n=>'/'+n));
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');let name=url.pathname;
 if(name==='/')name='/test/hisense/index.html';
 if(req.method!=='GET'||!allowed.has(name)){res.writeHead(404);res.end('Not found');return;}
 const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(name)];
 res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});fs.createReadStream(path.join(root,name)).pipe(res);
});
server.listen(Number(process.env.PORT)||8766,'127.0.0.1',()=>console.log('Hisense local benchmark: http://127.0.0.1:'+server.address().port+'/'));
