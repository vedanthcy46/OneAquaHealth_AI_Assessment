const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.resolve(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk(path.join(__dirname, 'frontend/src'));
let count = 0;
for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    const orig = content;
    
    // Replace single or double quoted URLs, converting to template literal
    content = content.replace(/['"]http:\/\/localhost:3001([^'"]*)['"]/g, '`${import.meta.env.VITE_API_URL || \'http://localhost:3001\'}$1`');
    
    // Replace occurrences already in template literals
    content = content.replace(/`http:\/\/localhost:3001([^`]*)`/g, '`${import.meta.env.VITE_API_URL || \'http://localhost:3001\'}$1`');
    
    if (content !== orig) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated ${file}`);
        count++;
    }
}
console.log(`Updated ${count} files.`);
