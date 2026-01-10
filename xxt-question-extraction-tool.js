// ==UserScript==
// @name         导出学习通试题为规范格式（含判断题）
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  抓取题目、选项与正确答案（判断题：对->A, 错->B），弹窗显示并可复制
// @match      	 *://*.chaoxing.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function(){
    'use strict';

    const trim = s => (s||'').replace(/\s+/g,' ').trim();

    function parseOptions(el){
        const lis = Array.from(el.querySelectorAll('.mark_letter li'));
        return lis.map(li=>{
            const raw = trim(li.textContent);
            const m = raw.match(/^([A-D])[\.\s：:]?\s*(.*)$/i);
            if(m) return {key: m[1].toUpperCase(), text: trim(m[2])};
            // 可能是没有字母的选项（判断题可能只写 "A. 对" 或 "对"）
            // 尝试识别完全是"对"或"错"
            if(/^对$/.test(raw)) return {key: 'A', text: '对'};
            if(/^错$/.test(raw)) return {key: 'B', text: '错'};
            // fallback：无字母，返回整行
            return {key: '', text: raw};
        });
    }

    function findCorrect(el){
        // 优先寻找明显的正确答案节点
        const selCandidates = [
            '.rightAnswerContent',
            '.rightAnswer',
            '.right-answer',
            '.element-invisible-hidden.colorGreen',
            '.mark_key .colorGreen .rightAnswerContent'
        ];
        for(const s of selCandidates){
            const node = el.querySelector(s);
            if(node && trim(node.textContent)){
                return normalizeAnswer(trim(node.textContent));
            }
        }
        // 有时正确答案写在隐形 span（无 class rightAnswerContent）
        const invisibles = Array.from(el.querySelectorAll('.element-invisible-hidden, .element-invisible-hidden.colorGreen'));
        for(const n of invisibles){
            const t = trim(n.textContent).replace(/[:；;、，\s]+/g,' ');
            if(/[A-D]|对|错/.test(t)){
                // 提取 A/B/C/D 或 对/错
                const m = t.match(/([A-D])/i);
                if(m) return m[1].toUpperCase();
                if(/对/.test(t)) return 'A';
                if(/错/.test(t)) return 'B';
            }
        }
        // 有时正确答案不存在（仅显示我的答案），返回空表示未知
        return '';
    }

    function normalizeAnswer(raw){
        // raw 可能是 "B"、"B; "、"：19世纪40年代; "、"ABD"、"对"、"错"
        if(!raw) return '';
        // 提取字母
        const letters = (raw.match(/[A-D]/g) || []).join('');
        if(letters) return letters;
        if(/对/.test(raw)) return 'A';
        if(/错/.test(raw)) return 'B';
        // 直接返回trim后的（最后手段）
        return raw;
    }

    function parseQuestion(node){
        // 题干
        let qEl = node.querySelector('.qtContent') || node.querySelector('.mark_name');
        let qText = qEl ? trim(qEl.textContent).replace(/^\d+\.\s*/, '') : '';
        // 选项
        const opts = parseOptions(node);
        // 正确答案（尝试多种方式）
        let right = findCorrect(node);
        // 特殊：判断题页面上可能没有显式正确答案，但题目类型是判断题
        if(!right){
            // 若是判断题，可尝试从选项中查找文本为“对”或“错”的选项并判断哪个被标记为正确（若页面没有正确标识则留空）
            const typeText = (node.querySelector('.type_tit') || node.querySelector('.colorShallow') || {}).textContent || '';
            if(/判断题/.test(typeText) || /判断题/.test(qText)){
                // 如果页面在 mark_key 中标识了我的答案并同时存在正确答案文本，findCorrect 已处理；否则无法得到正确答案 -> 返回空
                // 仍可确保判断题选项用 A/B 显示（对->A, 错->B）
                // 如果只有两个选项 "A. 对" "B. 错"，right 保持空（未知）
            }
        }

        return {qText, opts, right};
    }

    function buildOutput(list){
        const lines = [];
        list.forEach((it, idx)=>{
            lines.push(`${idx+1}. ${it.qText}`);
            if(it.opts && it.opts.length){
                it.opts.forEach(o=>{
                    if(o.key) lines.push(`${o.key}. ${o.text}`);
                    else lines.push(`- ${o.text}`);
                });
            }
            lines.push(`答案：${it.right || '未知'}`);
            lines.push('');
        });
        return lines.join('\n');
    }

    function collectAll(){
        const items = Array.from(document.querySelectorAll('.questionLi'));
        const visible = items.filter(i=>i.offsetParent !== null);
        return visible.map(parseQuestion);
    }

    function createButton(){
        if(document.getElementById('exportQuizBtn')) return;
        const btn = document.createElement('button');
        btn.id = 'exportQuizBtn';
        btn.textContent = '导出题目';
        Object.assign(btn.style, {position:'fixed', right:'12px', top:'12px', zIndex:99999, padding:'6px 10px', background:'#2d8cf0', color:'#fff', border:'none', borderRadius:'4px', cursor:'pointer'});
        btn.addEventListener('click', ()=>{
            const data = collectAll();
            if(!data.length){ alert('未找到题目节点'); return; }
            const out = buildOutput(data);
            showModal(out);
        });
        document.body.appendChild(btn);
    }

    function showModal(text){
        const wrap = document.createElement('div');
        Object.assign(wrap.style, {position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:999998, display:'flex', alignItems:'center', justifyContent:'center'});
        const box = document.createElement('div');
        Object.assign(box.style, {width:'80%', maxWidth:'900px', background:'#fff', padding:'12px', borderRadius:'6px', boxSizing:'border-box'});
        const ta = document.createElement('textarea');
        ta.value = text;
        Object.assign(ta.style, {width:'100%', height:'400px', boxSizing:'border-box', fontSize:'13px'});
        const btns = document.createElement('div'); btns.style.marginTop='8px';
        const copy = document.createElement('button'); copy.textContent = '复制到剪贴板'; copy.style.marginRight='8px';
        copy.addEventListener('click', ()=>{
            if(typeof GM_setClipboard === 'function'){ GM_setClipboard(ta.value); alert('已复制'); }
            else if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(ta.value).then(()=>alert('已复制'), ()=>alert('复制失败')); }
            else { ta.select(); document.execCommand('copy'); alert('已复制'); }
        });
        const close = document.createElement('button'); close.textContent = '关闭'; close.addEventListener('click', ()=>document.body.removeChild(wrap));
        btns.appendChild(copy); btns.appendChild(close);
        box.appendChild(ta); box.appendChild(btns); wrap.appendChild(box); document.body.appendChild(wrap);
    }

    // init
    setTimeout(createButton, 800);
    new MutationObserver(()=>createButton()).observe(document.body, {childList:true, subtree:true});
})();