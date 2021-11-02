const express = require('express');
const hbs = require('express-handlebars');
const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const session = require('express-session');
const app = express();
const formidable = require('formidable');

app.set('views', path.join(
    __dirname, 'views'
));

app.engine('hbs', hbs({
    defaultLayout: 'main.hbs',
    partialsDir: 'views/partials',
    extname: '.hbs',
    helpers: {

    }
}));

const icons = require('./catalog.json');
const mt = require('mime-types');

app.use('/static', express.static('static'));
app.use(express. urlencoded());
app.use(session({
    secret: 'lol',
    cookie: {}
}));
app.set('view engine', 'hbs');

if (!fssync.existsSync("content")) fssync.mkdirSync("content");

(async function run() {
    if (!require('fs').existsSync('db.json')) {
        await fs.writeFile("db.json", JSON.stringify({id:1,objects:{}}));
    }
    let database = JSON.parse(await fs.readFile('db.json'));

    function checkLogin(req, res, next) {
        if (req.session.loggedIn) next();
        else {
            res.render("login.hbs", {
                error: "Dostęp zabroniony"
            });
        }
    }

    app.get("/", (req, res) => {
        if (req.session.loggedIn) {
            res.render("index.hbs");
        } else {
            res.render("login.hbs");
        }
    });

    const { username, password } = process.env

    app.post("/handle_login", (req, res) => {
        if (req.body.username)  {
            if (req.body.username === username) {
                if (req.body.password) {
                    if (req.body.password === password) {
                        req.session.loggedIn = true;
                        req.session.save(() => {
                            res.redirect("/");
                        })
                        return;
                    }
                }
            }
        }
        
        res.render("login", {
            error: "Nie poprawne hasło"
        });
    })

    async function addFileToDb(fileInfo) {
        if (!require('fs').existsSync('content')) await fs.mkdir("content");
        
        let contentHash = fileInfo.hash;
        database.objects[database.id] = {
            name: fileInfo.name,
            type: fileInfo.type,
            size: fileInfo.size,
            diskName: contentHash,
            saveDate: Date.now(),
            id: database.id
        };
        database.id++;

        await fs.writeFile('db.json', JSON.stringify(database));
        await fs.copyFile(fileInfo.path, `content/${contentHash}`);
        await fs.unlink(fileInfo.path);
    }

    app.get("/reset", checkLogin, async (req, res) => {
        database = {
            id: 1,
            objects: {}
        };
        await fs.writeFile('db.json', JSON.stringify(database));
        res.redirect("/files");
    })

    app.post("/upload", checkLogin, async (req, res) => {
        const form = formidable({ multiples: true, hash: "sha256", maxFileSize: 1024 * 1024 * 1024 * 4 });
        let {fields, files} = await new Promise((res, rej) => {
            form.parse(req, (err, fields, files) => {
                if (err) rej(err);
                else res({fields, files});
            });
        });
        if (!Array.isArray(files.files)) files.files = [files.files];
        let done = 0;
        for (let f of files.files) {
            await addFileToDb(f);
            done++;
            console.log(`Processing: ${done} / ${files.files.length}`);
        }
        res.redirect("/files");
    });

    app.get("/files", checkLogin, async (req, res) => {
        let keys = Object.keys(database.objects).map(a => parseInt(a)).sort((a,b) => a - b);
        let data = [];
        for (let k of keys) {
            if (!database.objects[k].icon_name) {
                let ext = mt.extension(database.objects[k].type);
                if (!icons.includes(ext)) {
                    ext = "blank";
                }

                database.objects[k].icon_name = ext;
            }
            data.push(database.objects[k]);
        }

        res.render("files.hbs", {
            fileList: data
        })
    });

    app.get("/files/:id/delete", checkLogin, async (req, res) => {
        delete database.objects[req.params.id];
        await fs.writeFile('db.json', JSON.stringify(database));
        res.redirect("/files");
    });

    app.get("/files/:id/info", checkLogin, async (req, res) => {
        if (database.objects[req.params.id]) {
            res.render("fileinfo", {
                info: database.objects[req.params.id]
            });
        } else {
            res.render("nofile", {})
        }
    })

    app.get("/files/:id/download", checkLogin, async (req, res) => {
        if (database.objects[req.params.id]) {
            res.download(path.join(process.cwd(), 'content', database.objects[req.params.id].diskName), database.objects[req.params.id].name);
        } else {
            res.render("nofile", {})
        }
    })

    await new Promise(r => app.listen(5000, r));
    console.log("Ready");
})();
