// Test the production extension without ever copying a user's default resume.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
module.exports=function createExtensionFixture(root){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'qiuzhao-source-fixture-'));
  try{
    fs.copyFileSync(path.join(root,'manifest.json'),path.join(directory,'manifest.json'));
    for(const folder of ['background','content','popup','shared']){
      fs.mkdirSync(path.join(directory,folder));
      for(const file of fs.readdirSync(path.join(root,folder))){
        if(!/\.(?:js|mjs|css|html)$/.test(file))continue;
        fs.copyFileSync(path.join(root,folder,file),path.join(directory,folder,file));
      }
    }
    fs.cpSync(path.join(root,'vendor'),path.join(directory,'vendor'),{recursive:true});
    return {directory,remove:()=>fs.rmSync(directory,{recursive:true,force:true})};
  }catch(error){fs.rmSync(directory,{recursive:true,force:true});throw error;}
};
