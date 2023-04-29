// node bind_filename.js <img_dir> <gps_dir>
(() => {
    var fs = require('fs');

    var args = process.argv;
    var img_dir = args[2];
    var gps_dir = args[3];
    console.log(`img_dir: ${img_dir}`);
    console.log(`gps_dir: ${gps_dir}`);
    if (!img_dir || !gps_dir) {
        console.log('invalid arg(s)');
        process.exit(1);
    }

    // list files.
    let img_files = get_files(img_dir);
    let gps_files = get_files(gps_dir);

    // create point info.
    var count = 0;
    var points = [];
    gps_files.forEach(fgps => {
        img_files.forEach(fimg => {

            let gps_fname = fgps.split('/').pop();
            let img_fname = fimg.split('/').pop();
            if (gps_fname.split('.').length == 2 && img_fname.split('.').length == 2) {

                let a = gps_fname.split('.');
                let gps_ext = a.pop();
                let gps_name = a.pop();
                a = img_fname.split('.');
                let img_ext = a.pop();
                let img_name = a.pop();
                if (img_name === gps_name && gps_ext === 'json') {
                    const data = fs.readFileSync(fgps, 'utf-8');
                    const hash = JSON.parse(data);
                    points.push({
                        file: `${img_fname}`,
                        gps: `x${hash.longitude}y${hash.latitude}z${hash.altitude}`,
                        compass: `${hash.degrees}`
                    });
                    count++;
                }
            }
        });
    });

    // save json.
    let json = {
        'points': points
    };
    fs.writeFile(`${img_dir}/config.json`, JSON.stringify(json, null, 2), function (err) {
        if (err) {
            console.log(err);
        }
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
})();