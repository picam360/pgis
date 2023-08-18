var m_SQL = null;

function empty_gps_point() {
    return {
        'id': 0, // integer
        'compass': "",// direction deg. N is 0. CCW is pos.
        'x': "",// lon
        'y': "",// lat
        'z': "",// alt
        'accuracy': "",// meter for accuracy circle
        'altitudeAccuracy': "",
        'timestamp': "",
    };
}

class IPointHanlder {
    constructor() {
        if (this.constructor === IPointHanlder) {
            throw new Error('interface can not be called as class');
        }
    }
    get_point_id_list() { throw new Error('not implemented'); }
    get_point(gp_id){ throw new Error('not implemented'); }
    set_point(gp) { throw new Error('not implemented'); }
    delete_point(gp_id) { throw new Error('not implemented'); }
}

class PointHanlder extends IPointHanlder {
    constructor() {
        super();
        this.LSKEY_SQL_FILEPATH = "pgis_point_handler.sql";
        this.LSKEY_ID_LIST = "pgis_point_id_list";
        this.create_table_callbacks = [];
        this.insert_callbacks = [];
        this.update_callbacks = [];
        this.delete_callbacks = [];
        this.file_api = {
            read_all_lines: (filepath) => {
                var sql = localStorage.getItem(filepath);
                if(!sql){
                    return [];
                }else{
                    return sql.split(/\r\n|\n/);
                }
            },
            append_all_lines: (filepath, lines) => {
                if(!lines || lines.length == 0){
                    return;
                }
                var sql = localStorage.getItem(filepath);
                if(!sql){
                    sql = "";
                }else{
                    sql += '\n';
                }
                sql += lines.join('\n');
                localStorage.setItem(filepath, sql);
            },
        };

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
            });
        }
    }
    init(callback){
        if(!m_SQL){
            setTimeout(() => {
                this.init(callback);
            }, 100);
            return;
        }
        //sqlite columns type:[NULL,INTEGER,REAL,TEXT,BLOB]
        var columns = {
            id: "INTEGER PRIMARY KEY AUTOINCREMENT",
            compass: "REAL",
            x: "REAL",
            y: "REAL",
            z: "REAL",
            accuracy: "REAL",
            altitudeAccuracy: "REAL",
            timestamp: "TEXT",
        };
        for(var create_table_callback of this.create_table_callbacks){
            create_table_callback(columns);
        }
        var names = "";
        for(var name in columns){
            var type = null;
            if(!columns[name]){
                //pass through
            }else if(typeof columns[name] === 'object'){
                type = columns[name].type;
            }else{
                type = columns[name];
            }
            if(type){
                names += `,${name} ${type}`;
            }else{
                names += `,${name}`;
            }
        }
        names = names.slice(1);
        var sql = `create table points(${names});`;
        this.db = new m_SQL.Database();
        this.db.run(sql);
        
        var lines = this.file_api.read_all_lines(this.LSKEY_SQL_FILEPATH);
        for(var line of lines){
            if(line[0] == '#'){
                continue;
            }
            this.db.run(line);
        }

        if(callback){
            callback();
        }
    }
    add_create_table_callback(callback){
        this.create_table_callbacks.push(callback);
    }
    add_insert_callback(callback){
        this.insert_callbacks.push(callback);
    }
    add_update_callback(callback){
        this.update_callbacks.push(callback);
    }
    add_delete_callback(callback){
        this.delete_callbacks.push(callback);
    }
    _to_obj_ary(res) {
        if(!res || !res.values){
            return [];
        }
        var ary = [];
        for(var i=0;i<res.values.length;i++){
            ary[i] = {};
            for(var j=0;j<res.columns.length;j++){
                ary[i][res.columns[j]] = res.values[i][j];
            }
        }
        return ary;
    }
    get_points() {
        var sql = `select * from points;`;
        var res = this.db.exec(sql);
        var ary = this._to_obj_ary(res[0]);
        return ary;
    }
    get_point(gp_id){
        var sql = `select * from points where id="${gp_id}";`;
        var res = this.db.exec(sql);
        var ary = this._to_obj_ary(res[0]);
        if(ary.length == 0){
            return null;
        }else{
            return ary[0];
        }
    }
    set_point(gp) {
        //sql
        var columns = {
            compass: gp.compass,
            x: gp.x,
            y: gp.y,
            z: gp.z,
            accuracy: gp.accuracy,
            altitudeAccuracy: gp.altitudeAccuracy,
            timestamp: gp.timestamp,
        };
        for(var insert_callback of this.insert_callbacks){
            insert_callback(columns);
        }
        var names = "";
        var values = "";
        for(var name in columns){
            var value = null;
            if(!columns[name]){
                //pass through
            }else if(typeof columns[name] === 'object'){
                value = columns[name].value;
            }else{
                value = columns[name];
            }
            if(value){
                names += `,${name}`;
                if(typeof (value) === "string" || value instanceof String){
                    values += `,"${value}"`;
                }else{
                    values += `,${value}`;
                }
            }
        }
        names = names.slice(1);
        values = values.slice(1);
        var sql = `insert into points(${names}) values(${values});`;
        this.db.run(sql);
        this.file_api.append_all_lines(this.LSKEY_SQL_FILEPATH, [sql]);
    }
    delete_point(gp_id){
        //sql
        for(var delete_callback of this.delete_callbacks){
            delete_callback(gp_id);
        }
        var sql = `delete from points where id="${gp_id}";`;
        this.db.run(sql);
        this.file_api.append_all_lines(this.LSKEY_SQL_FILEPATH, [sql]);
    }
}