"use strict";

const TAG = {
    End: 0,
    Byte: 1,
    Short: 2,
    Int: 3,
    Long: 4,
    Float: 5,
    Double: 6,
    ByteArray: 7,
    String: 8,
    List: 9,
    Compound: 10,
    IntArray: 11,
    LongArray: 12
};


class NbtReader {

    constructor(buf) {
        this.dv = new DataView(
            buf.buffer,
            buf.byteOffset,
            buf.byteLength
        );

        this.bytes = buf;
        this.off = 0;
    }

    byte() {
        const v = this.dv.getInt8(this.off);
        this.off += 1;
        return v;
    }

    ubyte() {
        const v = this.dv.getUint8(this.off);
        this.off += 1;
        return v;
    }

    short() {
        const v = this.dv.getInt16(this.off);
        this.off += 2;
        return v;
    }

    ushort() {
        const v = this.dv.getUint16(this.off);
        this.off += 2;
        return v;
    }

    int() {
        const v = this.dv.getInt32(this.off);
        this.off += 4;
        return v;
    }

    long() {
        const v = this.dv.getBigInt64(this.off);
        this.off += 8;
        return v;
    }

    float() {
        const v = this.dv.getFloat32(this.off);
        this.off += 4;
        return v;
    }

    double() {
        const v = this.dv.getFloat64(this.off);
        this.off += 8;
        return v;
    }

    bytes_(n) {
        const v = this.bytes.slice(this.off, this.off + n);
        this.off += n;
        return v;
    }

    string() {
        const len = this.ushort();
        const b = this.bytes_(len);
        return new TextDecoder("utf-8").decode(b);
    }

    payload(type) {

        switch (type) {

            case TAG.Byte:
                return { type, value: this.byte() };

            case TAG.Short:
                return { type, value: this.short() };

            case TAG.Int:
                return { type, value: this.int() };

            case TAG.Long:
                return { type, value: this.long() };

            case TAG.Float:
                return { type, value: this.float() };

            case TAG.Double:
                return { type, value: this.double() };

            case TAG.ByteArray: {
                const len = this.int();
                const arr = new Int8Array(len);

                for (let i = 0; i < len; i++)
                    arr[i] = this.byte();

                return { type, value: arr };
            }

            case TAG.String:
                return { type, value: this.string() };

            case TAG.List: {

                const elemType = this.ubyte();
                const len = this.int();
                const items = [];

                for (let i = 0; i < len; i++)
                    items.push(this.payload(elemType));

                return {
                    type,
                    elemType,
                    value: items
                };
            }

            case TAG.Compound: {

                const entries = [];

                while (true) {

                    const t = this.ubyte();

                    if (t === TAG.End)
                        break;

                    const name = this.string();
                    const value = this.payload(t);

                    entries.push({
                        name,
                        tag: value
                    });
                }

                return {
                    type,
                    value: entries
                };
            }

            case TAG.IntArray: {

                const len = this.int();
                const arr = new Int32Array(len);

                for (let i = 0; i < len; i++)
                    arr[i] = this.int();

                return {
                    type,
                    value: arr
                };
            }

            case TAG.LongArray: {

                const len = this.int();
                const arr = new BigInt64Array(len);

                for (let i = 0; i < len; i++)
                    arr[i] = this.long();

                return {
                    type,
                    value: arr
                };
            }

            default:
                throw new Error("Unknown NBT tag type " + type);
        }
    }

    readRoot() {

        const type = this.ubyte();

        if (type !== TAG.Compound) {
            throw new Error(
                "Root tag is not a Compound."
            );
        }

        const name = this.string();
        const root = this.payload(TAG.Compound);

        return {
            name,
            root
        };
    }
}

class NbtWriter {

    constructor() {
        this.chunks = [];
        this.len = 0;
    }

    push(bytes) {
        this.chunks.push(bytes);
        this.len += bytes.length;
    }

    pushView(size, fn) {

        const buffer = new ArrayBuffer(size);
        fn(new DataView(buffer));

        this.push(new Uint8Array(buffer));
    }

    byte(v) {
        this.pushView(1, dv => dv.setInt8(0, v));
    }

    ubyte(v) {
        this.pushView(1, dv => dv.setUint8(0, v));
    }

    short(v) {
        this.pushView(2, dv => dv.setInt16(0, v));
    }

    ushort(v) {
        this.pushView(2, dv => dv.setUint16(0, v));
    }

    int(v) {
        this.pushView(4, dv => dv.setInt32(0, v));
    }

    long(v) {
        this.pushView(8, dv => dv.setBigInt64(0, v));
    }

    float(v) {
        this.pushView(4, dv => dv.setFloat32(0, v));
    }

    double(v) {
        this.pushView(8, dv => dv.setFloat64(0, v));
    }

    string(s) {

        const bytes =
            new TextEncoder().encode(s);

        this.ushort(bytes.length);
        this.push(bytes);
    }

    payload(node) {

        const { type, value } = node;

        switch (type) {

            case TAG.Byte:
                this.byte(value);
                break;

            case TAG.Short:
                this.short(value);
                break;

            case TAG.Int:
                this.int(value);
                break;

            case TAG.Long:
                this.long(value);
                break;

            case TAG.Float:
                this.float(value);
                break;

            case TAG.Double:
                this.double(value);
                break;

            case TAG.ByteArray:

                this.int(value.length);

                for (const v of value)
                    this.byte(v);

                break;

            case TAG.String:
                this.string(value);
                break;

            case TAG.List:

                this.ubyte(node.elemType);
                this.int(value.length);

                for (const item of value)
                    this.payload(item);

                break;

            case TAG.Compound:

                for (const entry of value) {

                    this.ubyte(entry.tag.type);
                    this.string(entry.name);
                    this.payload(entry.tag);
                }

                this.ubyte(TAG.End);

                break;

            case TAG.IntArray:

                this.int(value.length);

                for (const v of value)
                    this.int(v);

                break;

            case TAG.LongArray:

                this.int(value.length);

                for (const v of value)
                    this.long(v);

                break;

            default:
                throw new Error(
                    "Unknown NBT tag type " + type
                );
        }
    }

    writeRoot(name, root) {

        this.ubyte(TAG.Compound);
        this.string(name);
        this.payload(root);
    }

    toBytes() {

        const out = new Uint8Array(this.len);

        let offset = 0;

        for (const chunk of this.chunks) {

            out.set(chunk, offset);
            offset += chunk.length;
        }

        return out;
    }
}


/* ============================================================
   NBT HELPERS
   ============================================================ */

function cget(compound, name) {

    if (!compound || compound.type !== TAG.Compound)
        return null;

    return compound.value.find(
        e => e.name === name
    );
}


function tagValue(compound, name) {

    const entry = cget(compound, name);

    return entry ? entry.tag.value : null;
}


function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}


/* ============================================================
   FILE COMPRESSION
   ============================================================ */

async function readNbtFile(file) {

    const bytes =
        new Uint8Array(await file.arrayBuffer());

    let raw;

    if (
        bytes.length >= 2 &&
        bytes[0] === 0x1f &&
        bytes[1] === 0x8b
    ) {
        raw = pako.inflate(bytes);
    } else {
        raw = bytes;
    }

    return raw;
}


function writeNbtFile(rootName, root) {

    const writer = new NbtWriter();

    writer.writeRoot(rootName, root);

    return pako.gzip(writer.toBytes());
}


/* ============================================================
   STRUCTURE PALETTES
   ============================================================ */

function collectPaletteLists(root) {

    const lists = [];

    const palette = cget(root, "palette");

    if (
        palette &&
        palette.tag.type === TAG.List
    ) {
        lists.push(palette.tag);
    }

    const palettes = cget(root, "palettes");

    if (
        palettes &&
        palettes.tag.type === TAG.List
    ) {

        for (const sub of palettes.tag.value) {

            if (sub.type === TAG.List)
                lists.push(sub);
        }
    }

    return lists;
}


function getPaletteName(entry) {

    const name = cget(entry, "Name");

    return name
        ? name.tag.value
        : null;
}


/* ============================================================
   BLOCK ANALYSIS
   ============================================================ */

function analyzeBlocks(root) {

    const palettes =
        collectPaletteLists(root);

    if (!palettes.length) {
        throw new Error(
            "No 'palette' tag found."
        );
    }

    const primary = palettes[0];

    const indexToName =
        primary.value.map(getPaletteName);

    const counts = new Map();

    const blocks = cget(root, "blocks");

    if (
        blocks &&
        blocks.tag.type === TAG.List
    ) {

        for (const block of blocks.tag.value) {

            const state = cget(block, "state");

            if (!state)
                continue;

            const name =
                indexToName[state.tag.value];

            if (name != null) {

                counts.set(
                    name,
                    (counts.get(name) || 0) + 1
                );
            }
        }
    }

    const allNames =
        new Set(indexToName);

    for (const palette of palettes) {

        for (const entry of palette.value)
            allNames.add(getPaletteName(entry));
    }

    const rows = [];

    for (const name of allNames) {

        if (name == null)
            continue;

        rows.push({
            name,
            count: counts.get(name) || 0
        });
    }

    rows.sort(
        (a, b) =>
            b.count - a.count ||
            a.name.localeCompare(b.name)
    );

    return rows;
}


/* ============================================================
   BLOCK RENAMING
   ============================================================ */

function renameBlock(root, oldName, newName) {

    let changed = 0;

    for (const palette of collectPaletteLists(root)) {

        for (const entry of palette.value) {

            const name = cget(entry, "Name");

            if (
                name &&
                name.tag.value === oldName
            ) {

                name.tag.value = newName;
                changed++;
            }
        }
    }

    return changed;
}


/* ============================================================
   STRUCTURE ROTATION
   ============================================================ */

const DIR_CYCLE = [
    "north",
    "east",
    "south",
    "west"
];


function rotateDir(value) {

    const index =
        DIR_CYCLE.indexOf(value);

    if (index === -1)
        return value;

    return DIR_CYCLE[
        (index + 1) % 4
    ];
}


const RAIL_CW = {

    north_south: "east_west",
    east_west: "north_south",

    ascending_north: "ascending_east",
    ascending_east: "ascending_south",
    ascending_south: "ascending_west",
    ascending_west: "ascending_north",

    south_east: "south_west",
    south_west: "north_west",
    north_west: "north_east",
    north_east: "south_east"
};


function rotateProperties(props) {

    const entries = props.value;

    const cardinal =
        new Set([
            "north",
            "south",
            "east",
            "west"
        ]);

    const cardinalEntries =
        entries.filter(e =>
            cardinal.has(e.name)
        );

    const otherEntries =
        entries.filter(e =>
            !cardinal.has(e.name)
        );


    for (const entry of otherEntries) {

        const name = entry.name;
        const value = entry.tag.value;

        if (name === "facing") {

            entry.tag.value =
                rotateDir(value);

        } else if (name === "axis") {

            if (value === "x")
                entry.tag.value = "z";

            else if (value === "z")
                entry.tag.value = "x";

        } else if (name === "rotation") {

            const n = parseInt(value, 10);

            if (!isNaN(n))
                entry.tag.value =
                    String((n + 4) % 16);

        } else if (name === "orientation") {

            entry.tag.value =
                value
                    .split("_")
                    .map(rotateDir)
                    .join("_");

        } else if (
            name === "shape" &&
            Object.prototype.hasOwnProperty.call(
                RAIL_CW,
                value
            )
        ) {

            entry.tag.value =
                RAIL_CW[value];
        }
    }


    if (cardinalEntries.length) {

        const rotated =
            cardinalEntries.map(entry => ({
                name: rotateDir(entry.name),
                tag: entry.tag
            }));

        props.value = [
            ...otherEntries,
            ...rotated
        ];
    }
}


function rotateOnce(root) {

    const size = cget(root, "size");

    if (!size)
        throw new Error("No 'size' tag found.");

    const sx =
        size.tag.value[0].value;

    const sy =
        size.tag.value[1].value;

    const sz =
        size.tag.value[2].value;


    /* Rotate block properties */

    for (const palette of collectPaletteLists(root)) {

        for (const block of palette.value) {

            const props =
                cget(block, "Properties");

            if (
                props &&
                props.tag.type === TAG.Compound
            ) {
                rotateProperties(props.tag);
            }
        }
    }


    /* Rotate blocks */

    const blocks = cget(root, "blocks");

    if (
        blocks &&
        blocks.tag.type === TAG.List
    ) {

        for (const block of blocks.tag.value) {

            const pos =
                cget(block, "pos");

            if (!pos)
                continue;

            const x = pos.tag.value[0].value;
            const y = pos.tag.value[1].value;
            const z = pos.tag.value[2].value;

            pos.tag.value[0].value =
                sz - 1 - z;

            pos.tag.value[1].value =
                y;

            pos.tag.value[2].value =
                x;
        }
    }


    /* Rotate entities */

    const entities = cget(root, "entities");

    if (
        entities &&
        entities.tag.type === TAG.List
    ) {

        for (const entity of entities.tag.value) {

            const pos =
                cget(entity, "pos");

            if (pos) {

                const x = pos.tag.value[0].value;
                const y = pos.tag.value[1].value;
                const z = pos.tag.value[2].value;

                pos.tag.value[0].value =
                    sz - z;

                pos.tag.value[1].value =
                    y;

                pos.tag.value[2].value =
                    x;
            }


            const blockPos =
                cget(entity, "blockPos");

            if (blockPos) {

                const x =
                    blockPos.tag.value[0].value;

                const y =
                    blockPos.tag.value[1].value;

                const z =
                    blockPos.tag.value[2].value;

                blockPos.tag.value[0].value =
                    sz - 1 - z;

                blockPos.tag.value[1].value =
                    y;

                blockPos.tag.value[2].value =
                    x;
            }


            const nbt =
                cget(entity, "nbt");

            if (
                nbt &&
                nbt.tag.type === TAG.Compound
            ) {

                const rotation =
                    cget(nbt.tag, "Rotation");

                if (
                    rotation &&
                    rotation.tag.type === TAG.List &&
                    rotation.tag.value.length
                ) {

                    rotation.tag.value[0].value += 90;

                    if (
                        rotation.tag.value[0].value >= 180
                    ) {
                        rotation.tag.value[0].value -= 360;
                    }
                }
            }
        }
    }


    /* Swap dimensions */

    size.tag.value[0].value = sz;
    size.tag.value[2].value = sx;
}


function rotateStructure(root, steps) {

    const count =
        ((steps % 4) + 4) % 4;

    for (let i = 0; i < count; i++)
        rotateOnce(root);
}


/* ============================================================
   STRUCTURE PREVIEW
   ============================================================ */

function extractGrid(root) {

    const size =
        cget(root, "size");

    if (!size)
        throw new Error("No size tag.");

    const sx =
        size.tag.value[0].value;

    const sy =
        size.tag.value[1].value;

    const sz =
        size.tag.value[2].value;


    const palette =
        cget(root, "palette");

    const names =
        palette
            ? palette.tag.value.map(
                entry => getPaletteName(entry)
            )
            : [];


    const cells = new Map();

    const blocks =
        cget(root, "blocks");

    if (
        blocks &&
        blocks.tag.type === TAG.List
    ) {

        for (const block of blocks.tag.value) {

            const pos =
                cget(block, "pos");

            const state =
                cget(block, "state");

            if (!pos || !state)
                continue;

            const x =
                pos.tag.value[0].value;

            const y =
                pos.tag.value[1].value;

            const z =
                pos.tag.value[2].value;

            cells.set(
                `${x},${y},${z}`,
                names[state.tag.value] || "?"
            );
        }
    }


    return {
        sx,
        sy,
        sz,
        cells
    };
}


function swatchColor(name) {

    let hash = 0;

    for (let i = 0; i < name.length; i++) {

        hash =
            (hash * 31 +
                name.charCodeAt(i)) >>> 0;
    }

    const hue = hash % 360;
    const sat = 42 + (hash % 20);
    const light = 38 + (hash % 14);

    return `hsl(${hue} ${sat}% ${light}%)`;
}


/* ============================================================
   GENERIC NBT TREE
   ============================================================ */

function tagTypeName(type) {

    return Object.keys(TAG)
        .find(key => TAG[key] === type)
        || "Unknown";
}


function renderNbtTree(root) {

    const container =
        document.getElementById("nbt-tree");

    container.innerHTML = "";

    const tree =
        createNbtNode(
            "",
            root
        );

    container.appendChild(tree);
}


function createNbtNode(name, tag) {

    const wrapper =
        document.createElement("div");

    wrapper.className = "nbt-node";


    if (tag.type === TAG.Compound) {

        const title =
            document.createElement("div");

        title.className = "nbt-entry";

        title.innerHTML =
            `<span class="nbt-name">${escapeHtml(name || "Root")}</span>` +
            `<span class="nbt-type">${tagTypeName(tag.type)}</span>`;

        wrapper.appendChild(title);


        for (const entry of tag.value) {

            wrapper.appendChild(
                createNbtNode(
                    entry.name,
                    entry.tag
                )
            );
        }

    } else if (tag.type === TAG.List) {

        const title =
            document.createElement("div");

        title.className = "nbt-entry";

        title.innerHTML =
            `<span class="nbt-name">${escapeHtml(name)}</span>` +
            `<span class="nbt-type">List&lt;${tagTypeName(tag.elemType)}&gt;</span>`;

wrapper.appendChild(title);


for (let i = 0; i < tag.value.length; i++) {

    wrapper.appendChild(
        createNbtNode(
            `[${i}]`,
            tag.value[i]
        )
    );
}

} else {

    const entry =
        document.createElement("div");

    entry.className = "nbt-entry";

    let value = tag.value;

    if (typeof value === "bigint")
        value = value.toString() + "n";

    else if (value instanceof Int8Array)
        value = `[${value.length} bytes]`;

    else if (value instanceof Int32Array)
        value = `[${value.length} ints]`;

    else if (value instanceof BigInt64Array)
        value = `[${value.length} longs]`;

    entry.innerHTML =
        `<span class="nbt-name">${escapeHtml(name)}</span>` +
        `<span class="nbt-type">${tagTypeName(tag.type)}</span>` +
        `<span class="nbt-value">${escapeHtml(value)}</span>`;

    wrapper.appendChild(entry);
}


return wrapper;
}


/* ============================================================
   APPLICATION STATE
   ============================================================ */

const state = {

    fileName: null,
    rootName: "",
    root: null,

    originalBytes: null,

    rows: [],
    changeLog: [],

    sortMode: "count",
    filter: "",
    editingRow: null,

    rotation: 0,
    layerY: 0
};


/* ============================================================
   DOM
   ============================================================ */

const el = {

    dropzone:
        document.getElementById("dropzone"),

    fileInput:
        document.getElementById("file-input"),

    browseBtn:
        document.getElementById("browse-btn"),

    status:
        document.getElementById("status"),

    workspace:
        document.getElementById("workspace"),

    fname:
        document.getElementById("fname"),

    fmeta:
        document.getElementById("fmeta"),

    loadOther:
        document.getElementById("load-other-btn"),

    download:
        document.getElementById("download-btn"),

    search:
        document.getElementById("search"),

    blockTable:
        document.getElementById("block-table"),

    emptySearch:
        document.getElementById("empty-search"),

    changelogWrap:
        document.getElementById("changelog-wrap"),

    changelog:
        document.getElementById("changelog"),

    layerSlider:
        document.getElementById("layer-slider"),

    layerLabel:
        document.getElementById("layer-label"),

    canvas:
        document.getElementById("preview-canvas"),

    dims:
        document.getElementById("dims"),

    currentDeg:
        document.getElementById("current-deg"),

    reset:
        document.getElementById("reset-btn")
};


const ctx =
    el.canvas.getContext("2d");


/* ============================================================
   STATUS
   ============================================================ */

function status(message, type = "info") {

    el.status.textContent = message;
    el.status.className =
        "show " + type;
}


function clearStatus() {

    el.status.className = "";
}


/* ============================================================
   LOAD FILE
   ============================================================ */

async function loadFile(file) {

    clearStatus();

    status(
        "Reading " + file.name + "…"
    );

    try {

        const raw =
            await readNbtFile(file);

        state.originalBytes =
            raw.slice();

        const reader =
            new NbtReader(raw);

        const result =
            reader.readRoot();


        state.fileName = file.name;
        state.rootName = result.name;
        state.root = result.root;

        state.rotation = 0;
        state.layerY = 0;
        state.changeLog = [];
        state.editingRow = null;


        state.rows =
            analyzeBlocks(state.root);


        el.fname.textContent =
            state.fileName;

        el.dropzone.style.display =
            "none";

        el.workspace.classList.add("show");

        el.download.disabled = true;


        setupPreview();
        renderBlocks();
        renderNbtTree(state.root);

        updateMetadata();


        status(
            "Loaded " +
            file.name +
            " — " +
            state.rows.length +
            " unique block IDs.",
            "success"
        );

    } catch (error) {

        console.error(error);

        status(
            "Couldn't parse this file: " +
            error.message,
            "error"
        );
    }
}


/* ============================================================
   BLOCK UI
   ============================================================ */

function currentRows() {

    let rows =
        state.rows.slice();

    if (state.sortMode === "name") {

        rows.sort(
            (a, b) =>
                a.name.localeCompare(b.name)
        );

    } else {

        rows.sort(
            (a, b) =>
                b.count - a.count ||
                a.name.localeCompare(b.name)
        );
    }


    const filter =
        state.filter
            .trim()
            .toLowerCase();

    if (filter) {

        rows =
            rows.filter(row =>
                row.name
                    .toLowerCase()
                    .includes(filter)
            );
    }


    return rows;
}


function renderBlocks() {

    const rows =
        currentRows();

    el.blockTable.innerHTML = "";

    el.emptySearch.style.display =
        rows.length
            ? "none"
            : "block";


    for (const row of rows) {

        const rowEl =
            document.createElement("div");

        rowEl.className = "row";


        const swatch =
            document.createElement("div");

        swatch.className = "swatch";
        swatch.style.background =
            swatchColor(row.name);

        rowEl.appendChild(swatch);


        const main =
            document.createElement("div");

        main.className = "row-main";


        if (state.editingRow === row.name) {

            const input =
                document.createElement("input");

            input.className =
                "rename-input";

            input.value =
                row.name;

            main.appendChild(input);
            rowEl.appendChild(main);


            const actions =
                document.createElement("div");

            actions.className =
                "row-edit-actions";


            const apply =
                document.createElement("button");

            apply.className =
                "btn small primary";

            apply.textContent =
                "Apply";


            const cancel =
                document.createElement("button");

            cancel.className =
                "btn small ghost";

            cancel.textContent =
                "Cancel";


            actions.appendChild(apply);
            actions.appendChild(cancel);

            rowEl.appendChild(actions);


            const commit = () => {

                const newName =
                    input.value.trim();

                if (
                    !newName ||
                    newName === row.name
                ) {

                    state.editingRow = null;
                    renderBlocks();
                    return;
                }

                applyRename(
                    row.name,
                    newName
                );
            };


            apply.addEventListener(
                "click",
                commit
            );


            cancel.addEventListener(
                "click",
                () => {

                    state.editingRow = null;
                    renderBlocks();
                }
            );


            input.addEventListener(
                "keydown",
                event => {

                    if (event.key === "Enter")
                        commit();

                    if (event.key === "Escape") {

                        state.editingRow = null;
                        renderBlocks();
                    }
                }
            );


            setTimeout(() => {

                input.focus();
                input.select();

            }, 0);

        } else {

            const name =
                document.createElement("div");

            name.className =
                "block-name";

            name.textContent =
                row.name;

            main.appendChild(name);

            rowEl.appendChild(main);


            const count =
                document.createElement("div");

            count.className =
                "count";

            count.textContent =
                row.count;

            rowEl.appendChild(count);


            const rename =
                document.createElement("button");

            rename.className =
                "btn small";

            rename.textContent =
                "Rename";

            rename.addEventListener(
                "click",
                () => {

                    state.editingRow =
                        row.name;

                    renderBlocks();
                }
            );

            rowEl.appendChild(rename);
        }


        el.blockTable.appendChild(rowEl);
    }
}


function applyRename(oldName, newName) {

    const changed =
        renameBlock(
            state.root,
            oldName,
            newName
        );


    if (!changed) {

        status(
            "Couldn't find " + oldName,
            "error"
        );

        state.editingRow = null;
        renderBlocks();

        return;
    }


    state.rows =
        analyzeBlocks(state.root);

    state.changeLog.push({
        from: oldName,
        to: newName
    });

    state.editingRow = null;

    el.download.disabled = false;

    renderChangelog();
    renderBlocks();
    renderNbtTree(state.root);


    status(
        "Renamed " +
        oldName +
        " → " +
        newName,
        "success"
    );
}


function renderChangelog() {

    if (!state.changeLog.length) {

        el.changelogWrap.style.display =
            "none";

        return;
    }


    el.changelogWrap.style.display =
        "block";

    el.changelog.innerHTML = "";


    state.changeLog.forEach(
        (change, index) => {

            const item =
                document.createElement("div");

            item.className =
                "change-item";

            item.innerHTML =
                `<span>${escapeHtml(change.from)}</span>` +
                `<span class="arrow">→</span>` +
                `<span class="to">${escapeHtml(change.to)}</span>`;


            const undo =
                document.createElement("button");

            undo.className =
                "undo";

            undo.textContent =
                "undo";


            undo.addEventListener(
                "click",
                () => {

                    renameBlock(
                        state.root,
                        change.to,
                        change.from
                    );

                    state.changeLog.splice(
                        index,
                        1
                    );

                    state.rows =
                        analyzeBlocks(state.root);

                    el.download.disabled =
                        state.changeLog.length === 0;

                    renderChangelog();
                    renderBlocks();
                    renderNbtTree(state.root);

                    status(
                        "Reverted " +
                        change.to +
                        " → " +
                        change.from,
                        "info"
                    );
                }
            );


            item.appendChild(undo);
            el.changelog.appendChild(item);
        }
    );
}


/* ============================================================
   PREVIEW
   ============================================================ */

function setupPreview() {

    const grid =
        extractGrid(state.root);

    el.layerSlider.min = 0;

    el.layerSlider.max =
        Math.max(0, grid.sy - 1);

    state.layerY =
        Math.min(
            state.layerY,
            grid.sy - 1
        );

    el.layerSlider.value =
        state.layerY;

    el.layerLabel.textContent =
        "Y layer " + state.layerY;
}


function renderPreview() {

    const grid =
        extractGrid(state.root);

    const y =
        Math.min(
            state.layerY,
            grid.sy - 1
        );


    const cell =
        Math.max(
            4,
            Math.min(
                28,
                Math.floor(
                    240 /
                    Math.max(
                        grid.sx,
                        grid.sz
                    )
                )
            )
        );


    const width =
        grid.sx * cell;

    const height =
        grid.sz * cell;


    el.canvas.width =
        width;

    el.canvas.height =
        height;


    ctx.clearRect(
        0,
        0,
        width,
        height
    );


    for (
        let x = 0;
        x < grid.sx;
        x++
    ) {

        for (
            let z = 0;
            z < grid.sz;
            z++
        ) {

            const name =
                grid.cells.get(
                    `${x},${y},${z}`
                );


            if (
                name &&
                !/(^|_)air$/.test(
                    name.split(":").pop()
                )
            ) {

                ctx.fillStyle =
                    swatchColor(name);

                ctx.fillRect(
                    x * cell,
                    z * cell,
                    cell - 1,
                    cell - 1
                );
            }
        }
    }
}


/* ============================================================
   METADATA
   ============================================================ */

function updateMetadata() {

    const grid =
        extractGrid(state.root);

    el.fmeta.textContent =
        `${grid.sx}×${grid.sy}×${grid.sz} · ` +
        `rotated ${state.rotation}°`;


    el.currentDeg.textContent =
        state.rotation + "°";


    el.reset.disabled =
        state.rotation === 0;


    el.dims.innerHTML =
        `size: <b>${grid.sx} × ${grid.sy} × ${grid.sz}</b> (X×Y×Z)<br>` +
        `unique blocks: <b>${new Set(grid.cells.values()).size}</b><br>` +
        `block entries: <b>${grid.cells.size}</b>`;
}


/* ============================================================
   ROTATION
   ============================================================ */

function rotate(steps) {

    try {

        rotateStructure(
            state.root,
            steps
        );


        state.rotation =
            (
                state.rotation +
                steps * 90
            ) % 360;


        if (state.rotation < 0)
            state.rotation += 360;


        state.layerY = 0;

        setupPreview();
        updateMetadata();
        renderPreview();
        renderBlocks();
        renderNbtTree(state.root);


        el.download.disabled =
            state.rotation === 0 &&
            state.changeLog.length === 0;


        status(
            "Rotated to " +
            state.rotation +
            "°.",
            "success"
        );

    } catch (error) {

        console.error(error);

        status(
            "Couldn't rotate: " +
            error.message,
            "error"
        );
    }
}


function resetRotation() {

    if (!state.originalBytes)
        return;


    const reader =
        new NbtReader(
            state.originalBytes.slice()
        );

    const result =
        reader.readRoot();


    state.rootName =
        result.name;

    state.root =
        result.root;

    state.rotation = 0;


    setupPreview();
    updateMetadata();
    renderPreview();
    renderBlocks();
    renderNbtTree(state.root);


    el.download.disabled =
        state.changeLog.length === 0;


    status(
        "Reset to original orientation.",
        "info"
    );
}


/* ============================================================
   DOWNLOAD
   ============================================================ */

function downloadFile() {

    try {

        const bytes =
            writeNbtFile(
                state.rootName,
                state.root
            );


        const base =
            state.fileName
                .replace(/\.nbt$/i, "");


        const outputName =
            base + "_edited.nbt";


        const blob =
            new Blob(
                [bytes],
                {
                    type:
                        "application/octet-stream"
                }
            );


        const url =
            URL.createObjectURL(blob);

        const link =
            document.createElement("a");

        link.href = url;
        link.download = outputName;

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);


        status(
            "Downloaded " +
            outputName,
            "success"
        );

    } catch (error) {

        console.error(error);

        status(
            "Failed to export: " +
            error.message,
            "error"
        );
    }
}


/* ============================================================
   RESET
   ============================================================ */

function resetToDropzone() {

    state.fileName = null;
    state.rootName = "";
    state.root = null;
    state.originalBytes = null;

    state.rows = [];
    state.changeLog = [];

    state.rotation = 0;
    state.layerY = 0;

    el.workspace.classList.remove(
        "show"
    );

    el.dropzone.style.display =
        "block";

    el.fileInput.value = "";

    clearStatus();
}


/* ============================================================
   TOOL TABS
   ============================================================ */

document
    .querySelectorAll(".tool-tab")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                document
                    .querySelectorAll(".tool-tab")
                    .forEach(b =>
                        b.classList.remove("active")
                    );

                document
                    .querySelectorAll(".tool-panel")
                    .forEach(panel =>
                        panel.classList.remove("active")
                    );


                button.classList.add("active");


                const tool =
                    button.dataset.tool;

                document
                    .getElementById(
                        "tool-" + tool
                    )
                    .classList.add("active");


                if (tool === "preview")
                    renderPreview();
            }
        );
    });


/* ============================================================
   EVENTS
   ============================================================ */

el.browseBtn.addEventListener(
    "click",
    () => el.fileInput.click()
);


el.dropzone.addEventListener(
    "click",
    event => {

        if (
            event.target ===
            el.browseBtn
        )
            return;

        el.fileInput.click();
    }
);


el.fileInput.addEventListener(
    "change",
    event => {

        if (
            event.target.files &&
            event.target.files[0]
        ) {

            loadFile(
                event.target.files[0]
            );
        }
    }
);


for (const eventName of [
    "dragenter",
    "dragover"
]) {

    el.dropzone.addEventListener(
        eventName,
        event => {

            event.preventDefault();
            event.stopPropagation();

            el.dropzone.classList.add(
                "drag"
            );
        }
    );
}


for (const eventName of [
    "dragleave",
    "drop"
]) {

    el.dropzone.addEventListener(
        eventName,
        event => {

            event.preventDefault();
            event.stopPropagation();

            el.dropzone.classList.remove(
                "drag"
            );
        }
    );
}


el.dropzone.addEventListener(
    "drop",
    event => {

        const file =
            event.dataTransfer.files &&
            event.dataTransfer.files[0];

        if (file)
            loadFile(file);
    }
);


el.loadOther.addEventListener(
    "click",
    resetToDropzone
);


el.download.addEventListener(
    "click",
    downloadFile
);


el.search.addEventListener(
    "input",
    event => {

        state.filter =
            event.target.value;

        renderBlocks();
    }
);


document
    .querySelectorAll(
        ".sort-toggle button"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                document
                    .querySelectorAll(
                        ".sort-toggle button"
                    )
                    .forEach(
                        b =>
                            b.classList.remove(
                                "active"
                            )
                    );

                button.classList.add(
                    "active"
                );

                state.sortMode =
                    button.dataset.sort;

                renderBlocks();
            }
        );
    });


el.layerSlider.addEventListener(
    "input",
    event => {

        state.layerY =
            parseInt(
                event.target.value,
                10
            );

        el.layerLabel.textContent =
            "Y layer " +
            state.layerY;

        renderPreview();
    }
);


/* Rotation buttons */

document
    .getElementById("rot-90")
    .addEventListener(
        "click",
        () => rotate(1)
    );


document
    .getElementById("rot-ccw90")
    .addEventListener(
        "click",
        () => rotate(-1)
    );


document
    .getElementById("rot-180")
    .addEventListener(
        "click",
        () => rotate(2)
    );


el.reset.addEventListener(
    "click",
    resetRotation
);