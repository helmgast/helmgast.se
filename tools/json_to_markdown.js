import fs from 'fs';
import yaml from 'js-yaml';
import readline from 'readline';
import _ from 'lodash';
import path from 'path';

const readToMemory = async (files) => {
    let db = {};
    for (const file of files) {
        let filename = path.basename(file).split('.')[0];
        let thisDb = {};
        db[filename] = thisDb;
        const fileStream = fs.createReadStream(file);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        for await (const line of rl) {
            const item = JSON.parse(line);
            thisDb[item._id.$oid] = item;
        }
    }
    return db;
}

const convertToMarkdown = (db, sources) => {

    for (const source of sources) {
        let thisDb = db[source];
        if (_.isEmpty(thisDb)) {
            console.log(`No data found for ${source}`);
            continue;
        }
        let sourcePath = `./src/content/${source}`;
        // ensure path exists
        if (!fs.existsSync(sourcePath)) {
            fs.mkdirSync(sourcePath);
        }
        Object.values(thisDb).forEach(item => {
            const content = item.content || item.content_i18n?.sv || item.content_i18n?.en;
            delete item.content;
            delete item.content_i18n;

            for (const prop in item) {
                if (_.isEmpty(item[prop]) || item[prop] === "None" || prop === "shortcut" || prop === "publisher") {
                    delete item[prop];
                } else if (item[prop].$date) {
                    item[prop] = item[prop].$date;
                } else if (item[prop].$oid) {
                    // A reference to another object, let's see if we can look it up
                    let newValue;
                    if (prop === "_id") {
                        newValue = item[prop].$oid;
                    } else if (prop === "world") {
                        const world = db.worlds?.[item[prop].$oid];
                        newValue = world?.slug;
                    } else if (prop === "publisher") {
                        const pub = db.publishers?.[item[prop].$oid];
                        newValue = pub?.slug;
                    } else if (prop === "creator") {
                        const user = db.users?.[item[prop].$oid];
                        newValue = user?.realname || user?.username;
                    }

                    if (!newValue) {
                        console.log(`No value found for ${prop} in ${item._id.$oid}`);
                        item[prop] = item[prop].$oid;
                    } else {
                        item[prop] = newValue;
                    }
                } else if (prop === "editors") {
                    item[prop] = item[prop].map(editor => {
                        const user = db.users?.[editor.$oid];
                        return user?.realname || user?.username || editor.$oid;
                    });
                } else if (prop === "images") {
                    item[prop] = item[prop].map(img => {
                        const image = db.images?.[img.$oid];
                        return `https://helmgast.se/asset/image/${image?.slug}`;
                    });
                }
            }

            const frontmatter = yaml.dump(item);
            const mdContent = `---\n${frontmatter}---\n${content}\n`;
            
            if (item.slug) {
                fs.writeFileSync(`${sourcePath}/${item.slug}.md`, mdContent);
            } else {
                console.log(`No slug found for item in ${source}`, item);
            }
        });
    }
};

const files = process.argv.slice(2);
let db = await readToMemory(files);
convertToMarkdown(db, ["articles"]);
