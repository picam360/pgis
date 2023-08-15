var m_SQL = null;

function empty_gps_point() {
    return {
        'id': "", // x000y000z000_timestamp
        'file': "",// image file name
        'gps': "",// x000y000z000
        'compass': "",// direction deg. N is 0. CCW is pos.
        'x': "",// lon
        'y': "",// lat
        'z': "",// alt
        'accuracy': "",// meter for accuracy circle
        'altitudeAccuracy': "",
        'timestamp': "",
        'datetime': ""// record date
    };
}

function generate_gps_point_id(gp) {
    return `${gp.gps}_${gp.timestamp}`;
}

class IPointHanlder {
    constructor() {
        if (this.constructor === IPointHanlder) {
            throw new Error('interface can not be called as class');
        }
    }
    get_point_id_list() { throw new Error('not implemented'); }
    _set_point_id_list(list) { throw new Error('not implemented'); }
    get_point(gp_id){ throw new Error('not implemented'); }
    set_point(gp) { throw new Error('not implemented'); }
    delete_point(gp_id) { throw new Error('not implemented'); }
}

class LocalStoragePointHanlder extends IPointHanlder {
    constructor() {
        super();
        this.LSKEY_ID_LIST = "pgis_point_id_list";

        if(!m_SQL){
            var base_path = (function() {
                try{
                    var path = document.currentScript.src.split('?')[0];
                    var mydir = path.split('/').slice(0, -1).join('/') + '/';
                    if(mydir.startsWith('file://')){
                        mydir = mydir.substr('file://'.length);
                    }
                    return mydir;
                }catch(e){
                    return '';
                }
            })();
            const config = {
              locateFile: filename => base_path + `./lib/sql-js/${filename}`
            }
            initSqlJs(config).then((SQL) => {
                m_SQL = SQL;
                this.init(m_SQL);
            });
        }else{
            this.init(m_SQL);
        }
    }
    init(SQL){
        this.db = new SQL.Database();
        this.db.run("CREATE TABLE points (id, file, gps, compass, x, y, z, accuracy, altitudeAccuracy, timestamp, datetime);");
    }
    get_point_id_list() {
        var json = localStorage.getItem(this.LSKEY_ID_LIST);
        if (json) {
            return JSON.parse(json);
        }
        return [];
    }
    _set_point_id_list(list) { 
        var json = JSON.stringify(list);
        localStorage.setItem(this.LSKEY_ID_LIST, json);
    }
    get_point(gp_id){ 
        var json = localStorage.getItem(gp_id);
        if (json) {
            return JSON.parse(json);
        }
        return null;
    }
    set_point(gp) {
        // add to id list.
        gp.id = generate_gps_point_id(gp);
        var json = JSON.stringify(gp);
        localStorage.setItem(gp.id, json);

        // save point.
        let list = this.get_point_id_list();
        list.push(gp.id);
        this._set_point_id_list(list);
    }
    delete_point(gp_id){
        // remove from id list.
        let list = this.get_point_id_list();
        const filtered_lsit = list.filter(item => item !== gp_id);
        this._set_point_id_list(filtered_lsit);

        // remove point.
        localStorage.removeItem(gp_id);
    }
}