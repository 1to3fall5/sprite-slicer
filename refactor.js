const fs = require('fs');
const path = require('path');

// 1. 获取目标文件 (默认为 index.html)
const targetFile = process.argv[2] || 'index.html';
const htmlPath = path.resolve(process.cwd(), targetFile);
const fileDir = path.dirname(htmlPath);

// 设定输出文件名 (保持 style.css 和 script.js 通用惯例)
const cssFileName = 'style.css';
const jsFileName = 'script.js';

const cssPath = path.join(fileDir, cssFileName);
const jsPath = path.join(fileDir, jsFileName);

console.log(`🔍 正在分析: ${targetFile}`);

if (!fs.existsSync(htmlPath)) {
    console.error(`❌ 找不到文件: ${htmlPath}`);
    process.exit(1);
}

try {
    let html = fs.readFileSync(htmlPath, 'utf8');
    let cssExtracted = '';
    let jsExtracted = '';
    let cssCount = 0;
    let jsCount = 0;

    // --- 提取 CSS ---
    // 匹配 <style>...</style>，忽略属性
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    html = html.replace(styleRegex, (match, content) => {
        if (content && content.trim()) {
            cssExtracted += content.trim() + '\n\n';
            cssCount++;
        }
        return ''; // 从 HTML 中移除
    });

    // --- 提取 JS ---
    // 匹配不带 src 的 <script>
    const scriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    html = html.replace(scriptRegex, (match, content) => {
        if (content && content.trim()) {
            jsExtracted += content.trim() + '\n\n';
            jsCount++;
        }
        return ''; // 从 HTML 中移除
    });

    // --- 保存处理结果 ---

    // 1. 处理 CSS 文件
    if (cssCount > 0) {
        let finalCss = cssExtracted;
        
        // 如果文件已存在，追加内容而不是覆盖 (防止意外丢失)
        if (fs.existsSync(cssPath)) {
            const existing = fs.readFileSync(cssPath, 'utf8');
            finalCss = existing + '\n\n/* --- Extracted from HTML --- */\n\n' + cssExtracted;
            console.log(`⚠️ ${cssFileName} 已存在，新样式已追加到末尾。`);
        }
        
        fs.writeFileSync(cssPath, finalCss);
        console.log(`✅ 提取了 ${cssCount} 个样式块到 ${cssFileName}`);

        // 注入 <link> 标签 (如果不存在)
        if (!html.includes(cssFileName)) {
            const linkTag = `<link rel="stylesheet" href="${cssFileName}">`;
            if (html.includes('</head>')) {
                html = html.replace('</head>', `    ${linkTag}\n</head>`);
            } else {
                // 没有 head 标签时的后备方案
                html = linkTag + '\n' + html;
            }
        }
    }

    // 2. 处理 JS 文件
    if (jsCount > 0) {
        let finalJs = jsExtracted;

        if (fs.existsSync(jsPath)) {
            const existing = fs.readFileSync(jsPath, 'utf8');
            finalJs = existing + '\n\n// --- Extracted from HTML --- \n\n' + jsExtracted;
            console.log(`⚠️ ${jsFileName} 已存在，新脚本已追加到末尾。`);
        }

        fs.writeFileSync(jsPath, finalJs);
        console.log(`✅ 提取了 ${jsCount} 个脚本块到 ${jsFileName}`);

        // 注入 <script> 标签 (如果不存在)
        if (!html.includes(`src="${jsFileName}"`) && !html.includes(`src='${jsFileName}'`)) {
            const scriptTag = `<script src="${jsFileName}"></script>`;
            if (html.includes('</body>')) {
                html = html.replace('</body>', `    ${scriptTag}\n</body>`);
            } else {
                html += '\n' + scriptTag;
            }
        }
    }

    // 3. 更新 HTML 文件
    if (cssCount > 0 || jsCount > 0) {
        // 清理由于删除标签可能产生的多余空行 (简单清理连续3个以上换行)
        html = html.replace(/(\r\n|\n){3,}/g, '\n\n');
        
        fs.writeFileSync(htmlPath, html);
        console.log(`🎉 ${targetFile} 更新成功！`);
    } else {
        console.log('ℹ️ 未发现需要提取的内联样式或脚本。');
    }

} catch (err) {
    console.error('❌ 发生错误:', err);
}
