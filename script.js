const els = {
        upload: document.getElementById('imageUpload'),
        canvas: document.getElementById('mainCanvas'),
        wrapper: document.getElementById('imgWrapper'),
        empty: document.getElementById('emptyState'),
        linesOverlay: document.getElementById('linesOverlay'),
        cellsOverlay: document.getElementById('cellsOverlay'),
        rows: document.getElementById('rows'),
        cols: document.getElementById('cols'),
        resetBtn: document.getElementById('resetGridBtn'),
        zipBtn: document.getElementById('dlZipBtn'),
        bgCheck: document.getElementById('removeBgCheck'),
        bgSettings: document.getElementById('bgSettings'),
        bgPicker: document.getElementById('bgColorPicker'),
        bgBox: document.getElementById('colorPreviewBox'),
        hex: document.getElementById('hexValue'),
        eyeBtn: document.getElementById('eyedropperBtn'),
        thresh: document.getElementById('threshRange'),
        threshDisp: document.getElementById('threshDisp'),
        theme: document.getElementById('themeToggle'),
        inputs: ['eraseTop', 'eraseBottom', 'eraseLeft', 'eraseRight'].map(id => document.getElementById(id)),
        // Zoom Controls
        workspace: document.getElementById('workspace'),
        viewControls: document.getElementById('viewControls'),
        toggleGridBtn: document.getElementById('toggleGridBtn'),
        toggleMaskBtn: document.getElementById('toggleMaskBtn'),
        zoomInBtn: document.getElementById('zoomInBtn'),
        zoomOutBtn: document.getElementById('zoomOutBtn'),
        resetViewBtn: document.getElementById('resetViewBtn'),
        zoomLevel: document.getElementById('zoomLevel')
    };

    let state = {
        img: null,
        naturalW: 0,
        naturalH: 0,
        gridX: [], 
        gridY: [],
        bgColor: [0,0,0],
        picking: false,
        dragging: null,
        theme: 'dark',
        // View State
        zoom: 1,
        panX: 0,
        panY: 0,
        isPanning: false,
        lastMouseX: 0,
        lastMouseY: 0,
        showGrid: true,
        showMask: true
    };

    // --- 文件加载核心逻辑 (支持 Input 和 Paste) ---
    function handleFile(file) {
        if (!file) return;

        // 检查是否为 TGA 文件
        const isTGA = file.name.toLowerCase().endsWith('.tga');
        // 允许 image/* 类型或者 .tga 后缀
        if (!file.type.startsWith('image/') && !isTGA) return;
        
        if (isTGA) {
            const tga = new TGAImage();
            tga.onload = function() {
                // TGAImage 加载完成后，tga.canvas 包含图像数据
                const dataURL = tga.canvas.toDataURL('image/png');
                loadImage(dataURL, file.name);
                URL.revokeObjectURL(tga.src);
            };
            tga.onerror = function() {
                console.error('TGA Load Error');
                showToast('TGA 解析失败，请检查文件格式');
                URL.revokeObjectURL(tga.src);
            };
            tga.src = URL.createObjectURL(file);
            return;
        }

        const reader = new FileReader();
        reader.onload = evt => {
             loadImage(evt.target.result, file.name);
        };
        reader.readAsDataURL(file);
    }

    function loadImage(src, fileName) {
        state.img = new Image();
        state.img.onload = () => {
            state.naturalW = state.img.naturalWidth;
            state.naturalH = state.img.naturalHeight;
            els.canvas.width = state.naturalW;
            els.canvas.height = state.naturalH;
            
            els.empty.style.display = 'none';
            els.wrapper.style.display = 'block';
            els.viewControls.style.display = 'flex'; // Show controls
            els.zipBtn.disabled = false;

            initGridData();
            renderAll();
            centerView(); // Initial Center
            
            document.getElementById('fileMsg').innerHTML = fileName;
        };
        state.img.onerror = () => {
            showToast('无法识别的图片格式');
        };
        state.img.src = src;
    }

    // 1. Input Change 事件
    els.upload.addEventListener('change', e => {
        handleFile(e.target.files[0]);
    });

    // 2. 全局 Paste 事件
    document.addEventListener('paste', e => {
        const items = e.clipboardData?.items;
        if (!items) return;
        
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                handleFile(file);
                showToast('已从剪贴板加载图片');
                break;
            }
        }
    });

    // 3. 全局 Drag & Drop 事件
    let dragCounter = 0;

    document.addEventListener('dragenter', e => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter++;
        els.workspace.classList.add('is-dragging');
    });

    document.addEventListener('dragover', e => {
        e.preventDefault();
        e.stopPropagation();
    });
    
    document.addEventListener('dragleave', e => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter--;
        if (dragCounter === 0) {
            els.workspace.classList.remove('is-dragging');
        }
    });

    document.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter = 0;
        els.workspace.classList.remove('is-dragging');
        els.workspace.style.borderColor = '';
        
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleFile(files[0]);
            showToast('已加载拖拽图片');
        }
    });

    function initGridData() {
        if (!state.img) return;
        const r = parseInt(els.rows.value) || 1;
        const c = parseInt(els.cols.value) || 1;
        
        state.gridX = [];
        state.gridY = [];

        for (let i = 0; i <= c; i++) {
            state.gridX.push((state.naturalW / c) * i);
        }
        for (let i = 0; i <= r; i++) {
            state.gridY.push((state.naturalH / r) * i);
        }
    }

    function renderUI() {
        els.linesOverlay.innerHTML = '';
        els.cellsOverlay.innerHTML = '';
        if (!state.img) return;

        // Render Vertical Lines
        for (let i = 1; i < state.gridX.length - 1; i++) {
            const div = document.createElement('div');
            div.className = 'split-line split-line-v';
            const pct = (state.gridX[i] / state.naturalW) * 100;
            div.style.left = `${pct}%`;
            div.addEventListener('mousedown', (e) => startDrag(e, 'x', i));
            els.linesOverlay.appendChild(div);
        }

        // Render Horizontal Lines
        for (let i = 1; i < state.gridY.length - 1; i++) {
            const div = document.createElement('div');
            div.className = 'split-line split-line-h';
            const pct = (state.gridY[i] / state.naturalH) * 100;
            div.style.top = `${pct}%`;
            div.addEventListener('mousedown', (e) => startDrag(e, 'y', i));
            els.linesOverlay.appendChild(div);
        }

        // Render Cells Hitboxes
        for (let r = 0; r < state.gridY.length - 1; r++) {
            for (let c = 0; c < state.gridX.length - 1; c++) {
                const x = state.gridX[c];
                const y = state.gridY[r];
                const w = state.gridX[c+1] - x;
                const h = state.gridY[r+1] - y;

                const cell = document.createElement('div');
                cell.className = 'cell-hitbox';
                cell.style.left = (x / state.naturalW * 100) + '%';
                cell.style.top = (y / state.naturalH * 100) + '%';
                cell.style.width = (w / state.naturalW * 100) + '%';
                cell.style.height = (h / state.naturalH * 100) + '%';

                cell.addEventListener('click', (e) => {
                    if (state.panMoved) return; // 拖拽平移后不触发点击
                    if (state.picking) {
                        e.stopPropagation();
                        const rect = els.linesOverlay.getBoundingClientRect();
                        const clickX = (e.clientX - rect.left) * (state.naturalW / rect.width);
                        const clickY = (e.clientY - rect.top) * (state.naturalH / rect.height);
                        pickColor(clickX, clickY);
                    }
                });

                const actions = document.createElement('div');
                actions.className = 'cell-actions';
                
                // 1. View Button
                const btnView = document.createElement('button');
                btnView.className = 'mini-btn';
                btnView.title = "预览";
                btnView.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px"><path fill="currentColor" d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z"/></svg>';
                btnView.onclick = () => viewCell(r, c);

                // 2. Copy Button (New)
                const btnCopy = document.createElement('button');
                btnCopy.className = 'mini-btn';
                btnCopy.title = "复制";
                btnCopy.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px"><path fill="currentColor" d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z" /></svg>';
                btnCopy.onclick = () => copyCell(r, c);

                // 3. Download Button
                const btnDl = document.createElement('button');
                btnDl.className = 'mini-btn';
                btnDl.title = "下载";
                btnDl.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px"><path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/></svg>';
                btnDl.onclick = () => downloadCell(r, c);

                actions.appendChild(btnView);
                actions.appendChild(btnCopy);
                actions.appendChild(btnDl);
                cell.appendChild(actions);
                els.cellsOverlay.appendChild(cell);
            }
        }
    }

    function renderCanvas() {
        if (!state.img) return;
        const ctx = els.canvas.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, state.naturalW, state.naturalH);
        
        ctx.drawImage(state.img, 0, 0);

        const [t, b, l, r_pad] = els.inputs.map(i => parseInt(i.value) || 0);
        // Only remove bg if enabled AND showMask is true
        const removeBg = els.bgCheck.checked && state.showMask;
        const thresh = parseInt(els.thresh.value);
        const [tr, tg, tb] = state.bgColor;

        if (t || b || l || r_pad) {
            for (let rIdx = 0; rIdx < state.gridY.length - 1; rIdx++) {
                for (let cIdx = 0; cIdx < state.gridX.length - 1; cIdx++) {
                    const cx = state.gridX[cIdx];
                    const cy = state.gridY[rIdx];
                    const cw = state.gridX[cIdx+1] - cx;
                    const ch = state.gridY[rIdx+1] - cy;

                    if (t) ctx.clearRect(cx, cy, cw, t);
                    if (b) ctx.clearRect(cx, cy + ch - b, cw, b);
                    if (l) ctx.clearRect(cx, cy, l, ch);
                    if (r_pad) ctx.clearRect(cx + cw - r_pad, cy, r_pad, ch);
                }
            }
        }

        if (removeBg) {
            const frame = ctx.getImageData(0, 0, state.naturalW, state.naturalH);
            const d = frame.data;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i+3] === 0) continue;
                const dist = Math.sqrt((d[i]-tr)**2 + (d[i+1]-tg)**2 + (d[i+2]-tb)**2);
                if (dist < thresh) d[i+3] = 0;
            }
            ctx.putImageData(frame, 0, 0);
        }
    }

    function renderAll() {
        renderCanvas();
        renderUI();
    }

    function startDrag(e, axis, index) {
        e.preventDefault();
        e.stopPropagation();
        state.dragging = { axis, index };
        document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
        els.cellsOverlay.style.pointerEvents = 'none';
        window.addEventListener('mousemove', onDrag);
        window.addEventListener('mouseup', stopDrag);
    }

    function onDrag(e) {
        if (!state.dragging) return;
        const rect = els.linesOverlay.getBoundingClientRect();
        const { axis, index } = state.dragging;
        let min, max;
        
        if (axis === 'x') {
            const relativeX = e.clientX - rect.left;
            const pixelX = relativeX * (state.naturalW / rect.width);
            min = state.gridX[index - 1] + 2;
            max = state.gridX[index + 1] - 2;
            state.gridX[index] = Math.max(min, Math.min(max, pixelX));
        } else {
            const relativeY = e.clientY - rect.top;
            const pixelY = relativeY * (state.naturalH / rect.height);
            min = state.gridY[index - 1] + 2;
            max = state.gridY[index + 1] - 2;
            state.gridY[index] = Math.max(min, Math.min(max, pixelY));
        }
        renderUI();
    }

    function stopDrag() {
        state.dragging = null;
        document.body.style.cursor = '';
        els.cellsOverlay.style.pointerEvents = 'none';
        window.removeEventListener('mousemove', onDrag);
        window.removeEventListener('mouseup', stopDrag);
        renderCanvas();
        renderUI();
    }

    els.resetBtn.onclick = () => { initGridData(); renderAll(); };
    
    let timer;
    const debouncedRender = () => { clearTimeout(timer); timer = setTimeout(renderCanvas, 50); };
    
    els.inputs.forEach(el => el.addEventListener('input', debouncedRender));
    els.bgCheck.addEventListener('change', function() {
        els.bgSettings.style.opacity = this.checked ? '1' : '0.5';
        els.bgSettings.style.pointerEvents = this.checked ? 'auto' : 'none';
        if (!this.checked && state.picking) toggleEyeDropper();
        renderCanvas();
    });
    els.thresh.addEventListener('input', function() {
        els.threshDisp.textContent = this.value;
        debouncedRender();
    });
    
    els.bgPicker.addEventListener('input', function() {
        const hex = this.value;
        els.bgBox.style.background = hex;
        els.hex.textContent = hex.toUpperCase();
        state.bgColor = hexToRgb(hex);
        renderCanvas();
    });

    els.eyeBtn.onclick = toggleEyeDropper;
    async function toggleEyeDropper() {
        // 禁用原生 EyeDropper，使用自定义光标以避免遮挡和样式问题
        /*
        if (window.EyeDropper) {
            const eyeDropper = new EyeDropper();
            try {
                const result = await eyeDropper.open();
                const hex = result.sRGBHex;
                state.bgColor = hexToRgb(hex);
                els.bgPicker.value = hex;
                els.bgBox.style.background = hex;
                els.hex.textContent = hex.toUpperCase();
                renderCanvas();
            } catch (e) {}
            return;
        }
        */

        // 自定义方案
        state.picking = !state.picking;
        els.eyeBtn.classList.toggle('active', state.picking);
        
        // 切换 Workspace 的吸色状态类
        if (state.picking) {
            els.workspace.classList.add('is-picking');
        } else {
            els.workspace.classList.remove('is-picking');
        }
        
        // 旧逻辑清理
        const hitboxes = document.querySelectorAll('.cell-hitbox');
        hitboxes.forEach(el => el.style.cursor = '');
    }

    function pickColor(x, y) {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.drawImage(state.img, x, y, 1, 1, 0, 0, 1, 1);
        const p = ctx.getImageData(0,0,1,1).data;
        const hex = "#" + ((1 << 24) + (p[0] << 16) + (p[1] << 8) + p[2]).toString(16).slice(1);
        state.bgColor = [p[0], p[1], p[2]];
        els.bgPicker.value = hex;
        els.bgBox.style.background = hex;
        els.hex.textContent = hex.toUpperCase();
        toggleEyeDropper();
        renderCanvas();
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0,0,0];
    }

    // --- Helper: Get Blob ---
    function getSliceBlob(r, c) {
        const x = state.gridX[c];
        const y = state.gridY[r];
        const w = state.gridX[c+1] - x;
        const h = state.gridY[r+1] - y;
        const tmp = document.createElement('canvas');
        tmp.width = w; tmp.height = h;
        tmp.getContext('2d').drawImage(els.canvas, x, y, w, h, 0, 0, w, h);
        return new Promise(resolve => tmp.toBlob(resolve));
    }

    // --- View Modal Logic ---
    let modalState = { zoom: 1, panX: 0, panY: 0, isDragging: false, lastX: 0, lastY: 0 };
    const modalViewport = document.getElementById('modalViewport');
    const modalImg = document.getElementById('modalImg');

    window.viewCell = async (r, c) => {
        const blob = await getSliceBlob(r, c);
        const url = URL.createObjectURL(blob);
        modalImg.src = url;
        modalImg.onload = () => {
             // Reset State
             resetModalZoom();
             document.getElementById('viewModal').style.display = 'flex';
        };

        // Download Handler
        document.getElementById('modalDlBtn').onclick = () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = `slice_${r+1}_${c+1}.png`;
            a.click();
        };

        // Copy Handler is global
        window.currentBlob = blob; // Store for copy
    };

    window.closeModal = () => {
        document.getElementById('viewModal').style.display = 'none';
        modalImg.src = '';
    };

    window.resetModalZoom = () => {
        modalState = { zoom: 1, panX: 0, panY: 0, isDragging: false, lastX: 0, lastY: 0 };
        updateModalTransform();
    };

    window.copyModalImage = async () => {
        if (!window.currentBlob) return;
        try {
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': window.currentBlob })
            ]);
            showToast('已复制到剪贴板');
        } catch (err) {
            showToast('复制失败: ' + err.message);
        }
    };

    function updateModalTransform() {
        modalImg.style.transform = `translate(${modalState.panX}px, ${modalState.panY}px) scale(${modalState.zoom})`;
    }

    // Modal Zoom/Pan Events
    modalViewport.addEventListener('wheel', e => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.max(0.1, Math.min(10, modalState.zoom + delta));
        modalState.zoom = newZoom;
        updateModalTransform();
    });

    modalViewport.addEventListener('click', e => {
        if (e.target === modalViewport) {
            closeModal();
        }
    });

    modalViewport.addEventListener('mousedown', e => {
        if (e.target !== modalViewport && e.target !== modalImg) return;
        modalState.isDragging = true;
        modalState.lastX = e.clientX;
        modalState.lastY = e.clientY;
        modalViewport.classList.add('grabbing');
    });

    window.addEventListener('mousemove', e => {
        if (!modalState.isDragging) return;
        e.preventDefault();
        const dx = e.clientX - modalState.lastX;
        const dy = e.clientY - modalState.lastY;
        modalState.panX += dx;
        modalState.panY += dy;
        modalState.lastX = e.clientX;
        modalState.lastY = e.clientY;
        updateModalTransform();
    });

    window.addEventListener('mouseup', () => {
        if (modalState.isDragging) {
            modalState.isDragging = false;
            modalViewport.classList.remove('grabbing');
        }
    });

    // Close on overlay click
    document.getElementById('viewModal').addEventListener('click', e => {
        if (e.target.id === 'viewModal') closeModal();
    });

    // --- 新增: 复制功能 ---
    window.copyCell = async (r, c) => {
        try {
            const blob = await getSliceBlob(r, c);
            const item = new ClipboardItem({ [blob.type]: blob });
            await navigator.clipboard.write([item]);
            showToast('已复制到剪贴板');
        } catch (err) {
            console.error(err);
            showToast('复制失败: 浏览器不支持');
        }
    };

    window.downloadCell = async (r, c) => {
        const blob = await getSliceBlob(r, c);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `slice_${r+1}_${c+1}.png`;
        a.click();
    };

    els.zipBtn.onclick = async () => {
        if (!state.img) return;
        
        els.zipBtn.disabled = true;
        els.zipBtn.innerHTML = '<svg class="animate-spin" viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;animation:spin 1s linear infinite"><path d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z"/></svg> 打包处理中...';
        
        const zip = new JSZip();
        let count = 0;
        const rows = state.gridY.length - 1;
        const cols = state.gridX.length - 1;

        setTimeout(async () => {
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const blob = await getSliceBlob(r, c);
                    zip.file(`slice_${r+1}_${c+1}.png`, blob);
                    count++;
                }
            }

            const content = await zip.generateAsync({type:"blob"});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(content);
            a.download = "sprites_custom.zip";
            a.click();

            els.zipBtn.disabled = false;
            els.zipBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor"><path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z" /></svg> 打包下载所有切片 (ZIP)';
            showToast(`已下载 ${count} 个切片`);
        }, 100);
    };

    function showToast(msg) {
        const t = document.getElementById('status-toast');
        t.textContent = msg;
        t.style.display = 'block';
        setTimeout(()=>t.style.display='none', 3000);
    }

    els.theme.onclick = () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', state.theme);
    };

    // --- Zoom & Pan Logic ---
    function updateTransform() {
            els.wrapper.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
            els.wrapper.style.setProperty('--zoom', state.zoom);
            els.zoomLevel.textContent = Math.round(state.zoom * 100) + '%';
        }

    function centerView() {
        if (!state.img) return;
        const wsRect = els.workspace.getBoundingClientRect();
        
        // Auto fit if image is too large
        const padding = 40;
        const availableW = wsRect.width - padding * 2;
        const availableH = wsRect.height - padding * 2;
        
        const scaleW = availableW / state.naturalW;
        const scaleH = availableH / state.naturalH;
        let scale = Math.min(scaleW, scaleH);
        
        // if (scale > 1) scale = 1; // Don't upscale small images initially
        if (scale < 0.1) scale = 0.1; // 保持最小缩放限制，防止过小

        state.zoom = scale;
        state.panX = (wsRect.width - state.naturalW * state.zoom) / 2;
        state.panY = (wsRect.height - state.naturalH * state.zoom) / 2;
        
        updateTransform();
    }

    // --- View Toggles ---
    els.toggleGridBtn.onclick = () => {
        state.showGrid = !state.showGrid;
        els.toggleGridBtn.classList.toggle('active', state.showGrid);
        els.linesOverlay.style.visibility = state.showGrid ? 'visible' : 'hidden';
        els.cellsOverlay.style.visibility = state.showGrid ? 'visible' : 'hidden'; // Hide cells (and buttons) if grid hidden
    };

    els.toggleMaskBtn.onclick = () => {
        state.showMask = !state.showMask;
        els.toggleMaskBtn.classList.toggle('active', state.showMask);
        renderCanvas();
    };

    // Wheel Zoom
    els.workspace.addEventListener('wheel', (e) => {
        if (!state.img) return;
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.max(0.1, Math.min(5, state.zoom + delta));
        
        if (newZoom !== state.zoom) {
            // Zoom towards mouse pointer
            const rect = els.wrapper.getBoundingClientRect();
            // Mouse relative to wrapper (current zoom)
            // But wrapper is transformed... 
            // Easier: Calculate mouse relative to Workspace
            const wsRect = els.workspace.getBoundingClientRect();
            const mouseX = e.clientX - wsRect.left;
            const mouseY = e.clientY - wsRect.top;

            // Mouse relative to image (0-1)
            // currentX = panX + imgX * zoom
            // imgX * zoom = mouseX - panX
            // imgX = (mouseX - panX) / zoom
            
            const imgX = (mouseX - state.panX) / state.zoom;
            const imgY = (mouseY - state.panY) / state.zoom;

            // New Pan:
            // mouseX = newPanX + imgX * newZoom
            // newPanX = mouseX - imgX * newZoom
            
            state.panX = mouseX - imgX * newZoom;
            state.panY = mouseY - imgY * newZoom;
            state.zoom = newZoom;
            
            updateTransform();
        }
    });

    // Pan Drag
    els.workspace.addEventListener('mousedown', (e) => {
        if (!state.img) return;
        // Don't trigger pan if clicking on controls or overlays that capture events
        // 允许在 cell-hitbox 上拖拽，但排除按钮
        if (e.target.closest('.split-line') || e.target.closest('.mini-btn') || e.target.closest('#viewControls')) return;

        state.isPanning = true;
        state.panMoved = false;
        state.lastMouseX = e.clientX;
        state.lastMouseY = e.clientY;
        els.workspace.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!state.isPanning) return;
        e.preventDefault();
        
        const deltaX = e.clientX - state.lastMouseX;
        const deltaY = e.clientY - state.lastMouseY;
        
        if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
            state.panMoved = true;
        }

        state.panX += deltaX;
        state.panY += deltaY;
        state.lastMouseX = e.clientX;
        state.lastMouseY = e.clientY;
        
        updateTransform();
    });

    window.addEventListener('mouseup', () => {
        if(state.isPanning) {
            state.isPanning = false;
            els.workspace.style.cursor = 'grab';
        }
    });

    // Buttons
    els.zoomInBtn.onclick = () => {
        if (!state.img) return;
        state.zoom = Math.min(5, state.zoom + 0.2);
        // Zoom center
        const wsRect = els.workspace.getBoundingClientRect();
        const cx = wsRect.width / 2;
        const cy = wsRect.height / 2;
        // Adjust pan to keep center
        // (cx - panX) / oldZoom = (cx - newPanX) / newZoom ???
        // Simplification: just scale, user can pan. Or use similar logic to wheel.
        // Let's use logic similar to wheel but center of workspace.
        const imgX = (cx - state.panX) / (state.zoom - 0.2); // approx prev zoom
        // Actually, cleaner to just update zoom and let pan be? No, it zooms to top-left if we don't adjust pan.
        // Let's just update transform for now or implement center-zoom if requested.
        // The EdgeExtender implementation just updates zoom.
        updateTransform();
    };

    els.zoomOutBtn.onclick = () => {
        if (!state.img) return;
        state.zoom = Math.max(0.1, state.zoom - 0.2);
        updateTransform();
    };

    els.resetViewBtn.onclick = centerView;