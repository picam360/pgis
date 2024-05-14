// node create_config.js <img_dir_contains_json>
(() => {
    const fs = require('fs');
    const path = require('path');
    const J_EXT = ".insp";
    const I_EXT = "_PureShot.jpg";

    var args = process.argv;
    var img_dir = args[2];
    if (!img_dir) {
        console.log('invalid arg(s)');
        process.exit(1);
    }

    function get_files(dir) {
        let allnames = fs.readdirSync(dir);
        let fileNames = allnames.filter(name => !fs.lstatSync(`${dir}/${name}`).isDirectory());
        return fileNames.map(name => `${dir}/${name}`);
    }

    let tmp_points = {};
    let img_names = [];
    let files = get_files(img_dir);
    files.forEach(f => {
        if (f.endsWith("/config.json")) {
            console.error("please delete config.json before create_config:");
            console.error(f);
            process.exit(1);
        }
        else if (f.endsWith(".json")) {
            const data = fs.readFileSync(f, 'utf-8');
            const arry = JSON.parse(data);
            arry.forEach(h => {
                let fn = h.file;
                if(h.file.endsWith(J_EXT)){
                    fn = h.file.split(".").slice(0, -1).join(".");
                    fn += I_EXT;
                }
                tmp_points[fn] =
                {
                    filename: fn,
                    location: h.gps.replace('x', ',').replace('y', ',').replace('z', ','),
                    compass: h.compass,
                };
            });
        }
        else if (f.endsWith(".jpg")) {
            img_names.push(
                f.split('/').pop());
        }
    });

    let json = {
        'points': []
    };
    img_names.forEach(name => {
        let p = tmp_points[name];
        if (p) {
            json.points.push(p);
        }
        else {
            console.log(`not found in json: ${name}`);
        }
    });

    fs.writeFile(`${img_dir}/config.json`, JSON.stringify(json, null, 2), function (err) {
        if (err) {
            console.log(err);
        }
    });

    console.log("completed.");
})();

// // node bind_filename.js <img_dir> <gps_dir>
// (() => {
//     var fs = require('fs');

//     var args = process.argv;
//     var img_dir = args[2];
//     var gps_dir = args[3];
//     console.log(`img_dir: ${img_dir}`);
//     console.log(`gps_dir: ${gps_dir}`);
//     if (!img_dir || !gps_dir) {
//         console.log('invalid arg(s)');
//         process.exit(1);
//     }

//     // list files.
//     let img_files = get_files(img_dir);
//     let gps_files = get_files(gps_dir);

//     // create point info.
//     var count = 0;
//     var points = [];
//     gps_files.forEach(fgps => {
//         img_files.forEach(fimg => {

//             let gps_fname = fgps.split('/').pop();
//             let img_fname = fimg.split('/').pop();
//             if (gps_fname.split('.').length == 2 && img_fname.split('.').length == 2) {

//                 let a = gps_fname.split('.');
//                 let gps_ext = a.pop();
//                 let gps_name = a.pop();
//                 a = img_fname.split('.');
//                 let img_ext = a.pop();
//                 let img_name = a.pop();
//                 if (img_name === gps_name && gps_ext === 'json') {
//                     const data = fs.readFileSync(fgps, 'utf-8');
//                     const hash = JSON.parse(data);
//                     points.push({
//                         file: `${img_fname}`,
//                         gps: `x${hash.longitude}y${hash.latitude}z${hash.altitude}`,
//                         compass: `${hash.degrees}`
//                     });
//                     count++;
//                 }
//             }
//         });
//     });

//     // save json.
//     let json = {
//         'points': points
//     };
//     fs.writeFile(`${img_dir}/config.json`, JSON.stringify(json, null, 2), function (err) {
//         if (err) {
//             console.log(err);
//         }
//     });

//     if (count > 0) {
//         console.log("successfully completed.")
//     } else {
//         console.log("no file output");
//     }

//     function get_files(dir) {
//         let allnames = fs.readdirSync(dir);
//         let fileNames = allnames.filter(name => !fs.lstatSync(`${dir}/${name}`).isDirectory());
//         return fileNames.map(name => `${dir}/${name}`);
//     }
// })();