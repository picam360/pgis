// node bind_filename.js <img_dir> <gps_dir> <out_dir>

var fs = require('fs');

var args = process.argv;
var img_dir = args[2];
var gps_dir = args[3];
var out_dir = args[4];
console.log(`img_dir: ${img_dir}`);
console.log(`gps_dir: ${gps_dir}`);
console.log(`out_dir: ${out_dir}`);
if (!img_dir || !gps_dir || !out_dir) {
    console.log('invalid arg(s)');
    process.exit(1);
}
if (!fs.existsSync(out_dir)) {
    console.log('output dir does not exist');
    process.exit(1);
}

// create dest dir.
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const hour = String(now.getHours()).padStart(2, '0');
const minute = String(now.getMinutes()).padStart(2, '0');
const second = String(now.getSeconds()).padStart(2, '0');
const foldername = `${year}-${month}-${day}_${hour}-${minute}-${second}`;
let dst_dir = `${out_dir}/${foldername}`;

try {
    fs.mkdirSync(dst_dir);
    console.log(`フォルダ ${dst_dir} を作成しました。`);
} catch (err) {
    console.error(err);
    process.exit(1);
}

// list files.
let img_files = get_files(img_dir);
let gps_files = get_files(gps_dir);
var count = 0;
gps_files.forEach(fgps => {
    img_files.forEach(fimg => {
        let a_g = fgps.split('/');
        let a_i = fimg.split('/');
        if (a_g[a_g.length - 1].startsWith(a_i[a_i.length - 1])) {
            try {
                console.log(`start: ${fgps}`);

                // file ext.
                const a_img_ext = a_i[a_i.length - 1].split('.');
                const img_ext = a_img_ext[a_img_ext.length - 1];
                const a_gps_ext = a_g[a_g.length - 1].split('.');
                const gps_ext = a_gps_ext[a_gps_ext.length - 1];
                
                if (gps_ext === "json") {
                    // read gps file.
                    const data = fs.readFileSync(fgps, 'utf-8');
                    const hash = JSON.parse(data);
                    const fname = `x${hash.lon}y${hash.lat}z${hash.alt}`;
                    const dstfilename = `${dst_dir}/${fname}.${img_ext}`;

                    // copy iamge file to dest.
                    fs.copyFileSync(fimg, dstfilename);
                    console.log(dstfilename);
                    count++;
                }
            }
            catch (err) {
                console.error(err);
                process.exit(1);
            }
        }
    });
});

if (count > 0) {
    console.log("successfully completed.")
} else {
    console.log("no file output");
}

function get_files(dir) {
    let allnames = fs.readdirSync(dir);
    let fileNames = allnames.filter(name => !fs.lstatSync(`${dir}/${name}`).isDirectory());
    return fileNames.map(name => `${dir}/${name}`);
}