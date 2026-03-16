// ========== 鋼材発注 (order.js) ==========
import {
  db, doc, getDoc, setDoc, addDoc, getDocs, updateDoc, deleteDoc,
  collection, query, where, orderBy,
  serverTimestamp
} from './config.js';
import { state } from './state.js';
import { esc, normalizeProjectKey } from './utils.js';

// ===== 内部状態 =====
let _suppliers = [];   // order_suppliers
let _items = [];       // order_items
let _historyOffset = 0; // 履歴期間オフセット（0=今期）
let _gasUrl = '';
let _orderType = 'factory';    // 工場在庫 / 現場名発注
let _materialFilter = 'all';   // すべて / steel / stainless
let _categoryFilter = 'all';   // カテゴリ絞り込み
let _searchQuery = '';          // 検索文字列
let _showSelectedOnly = false;  // 選択済みのみ表示
let _pins = [];                 // ピン留め品目ID（localStorage）
let _recent = [];               // 最近使った品目ID（localStorage、最大10件）
let _checkedItems = new Map();  // itemId → {checked, qty, length, finish}
let _historyOrders = [];     // 履歴モーダルで読み込んだ発注データ
let _deletedHistoryOrders = []; // 削除済み履歴

// ===== カタログシードデータ =====
// materialType: 'steel'=スチール, 'stainless'=ステンレス
// availableLengths: 選択可能な定尺長さ
const CATALOG_SEED = [
  // ─── アングル（等辺山形鋼）───
  ...[
    ['3×20×20',['5.5m']],['3×25×25',['5.5m']],['3×30×30',['5.5m']],['5×30×30',['5.5m']],
    ['3×40×40',['5.5m']],['5×40×40',['5.5m']],
    ['4×50×50',['5.5m','6m','7m','8m','9m','10m','11m','12m']],
    ['6×50×50',['5.5m','6m','7m','8m','9m','10m','11m','12m']],
    ['6×65×65',['5.5m','6m','7m','8m','9m','10m','11m','12m']],
    ['8×65×65',['5.5m']],
    ['6×75×75',['5.5m','6m','7m','8m','9m','10m','11m','12m']],
    ['9×75×75',['5.5m','6m','7m','8m','9m','10m','11m','12m']],
    ['7×90×90',['5.5m','6m','7m','8m','9m','10m','11m','12m']],
    ['10×90×90',['5.5m','6m','7m','8m','9m','10m','11m','12m']],
    ['7×100×100',['5.5m','6m','7m','8m','9m','10m','11m','12m']],
    ['10×100×100',['5.5m','6m','7m','8m','9m','10m','11m','12m']],
  ].map(([spec,lengths],i)=>({itemCategory:'アングル',spec,availableLengths:lengths,sortOrder:100+i})),

  // ─── 丸鋼（SR235）───
  ...[
    ['φ6',['5.5m']],['φ9',['5.5m','6m']],['φ13',['5.5m','6m']],
    ['φ16',['5.5m','6m']],['φ19',['5.5m','6m']],['φ22',['5.5m','6m']],
    ['φ25',['5.5m','6m']],['φ28',['5.5m']],['φ32',['5.5m']],
  ].map(([spec,lengths],i)=>({itemCategory:'丸鋼',spec,availableLengths:lengths,sortOrder:200+i})),

  // ─── 平鋼（FB） ───
  ...[
    // t=3
    ['3×13',['5.5m']],['3×16',['5.5m']],['3×19',['5.5m']],['3×22',['5.5m']],['3×25',['5.5m']],
    ['3×32',['5.5m']],['3×38',['5.5m']],['3×44',['5.5m']],['3×50',['5.5m']],
    ['3×65',['5.5m']],['3×75',['5.5m']],['3×90',['5.5m']],['3×100',['5.5m']],
    ['3×125',['5.5m']],['3×150',['5.5m']],
    // t=4.5
    ['4.5×13',['5.5m']],['4.5×16',['5.5m']],['4.5×19',['5.5m']],['4.5×22',['5.5m']],
    ['4.5×25',['5.5m']],['4.5×32',['5.5m']],['4.5×38',['5.5m']],['4.5×44',['5.5m']],
    ['4.5×50',['5.5m','6m']],['4.5×65',['5.5m']],['4.5×75',['5.5m']],['4.5×90',['5.5m']],
    ['4.5×100',['5.5m']],['4.5×125',['5.5m']],['4.5×150',['5.5m']],
    // t=6
    ['6×13',['5.5m']],['6×16',['5.5m']],['6×19',['5.5m']],['6×22',['5.5m']],['6×25',['5.5m']],
    ['6×32',['5.5m']],['6×38',['5.5m']],['6×44',['5.5m']],
    ['6×50',['5.5m','6m']],['6×60',['6m']],['6×65',['5.5m','6m']],['6×70',['6m']],
    ['6×75',['5.5m','6m']],['6×80',['6m']],['6×90',['5.5m','6m']],
    ['6×100',['5.5m']],['6×125',['5.5m']],['6×150',['5.5m','6m']],
    // t=9
    ['9×16',['5.5m']],['9×19',['5.5m']],['9×22',['5.5m']],['9×25',['5.5m']],
    ['9×32',['5.5m']],['9×38',['5.5m']],['9×44',['5.5m']],
    ['9×50',['5.5m','6m']],['9×60',['6m']],['9×65',['5.5m','6m']],['9×70',['6m']],
    ['9×75',['5.5m','6m']],['9×80',['6m']],['9×90',['5.5m','6m']],
    ['9×100',['5.5m','6m']],['9×110',['6m']],['9×125',['5.5m','6m']],['9×150',['5.5m','6m']],
    // t=12
    ['12×25',['5.5m']],['12×32',['5.5m']],['12×38',['5.5m']],['12×44',['5.5m']],
    ['12×50',['5.5m']],['12×60',['6m']],['12×65',['5.5m']],['12×70',['6m']],
    ['12×75',['5.5m','6m']],['12×80',['6m']],['12×90',['5.5m']],['12×100',['5.5m','6m']],
    ['12×110',['6m']],['12×125',['5.5m','6m']],['12×150',['5.5m','6m']],
    // t=16
    ['16×25',['5.5m']],['16×32',['5.5m']],['16×38',['5.5m']],['16×44',['5.5m']],
    ['16×50',['5.5m']],['16×65',['5.5m']],['16×70',['6m']],['16×75',['5.5m','6m']],
    ['16×80',['6m']],['16×90',['5.5m']],['16×100',['5.5m']],['16×110',['6m']],
    ['16×125',['5.5m']],['16×150',['5.5m']],
    // t=19
    ['19×25',['5.5m']],['19×32',['5.5m']],['19×44',['5.5m']],['19×50',['5.5m']],
    ['19×65',['5.5m','6m']],['19×70',['6m']],['19×75',['5.5m']],['19×90',['5.5m']],
    ['19×100',['5.5m']],['19×110',['6m']],['19×125',['5.5m']],['19×150',['5.5m']],
    // t=22
    ['22×38',['5.5m']],['22×44',['5.5m']],['22×50',['5.5m']],['22×65',['5.5m']],
    ['22×75',['5.5m']],['22×90',['5.5m']],['22×100',['5.5m']],['22×125',['5.5m']],['22×150',['5.5m']],
    // t=25
    ['25×32',['5.5m']],['25×38',['5.5m']],['25×50',['5.5m']],['25×65',['5.5m']],
    ['25×75',['5.5m']],['25×90',['5.5m']],['25×100',['5.5m']],['25×125',['5.5m']],['25×150',['5.5m']],
    // t=28
    ['28×50',['5.5m']],['28×65',['5.5m']],['28×75',['5.5m']],['28×90',['5.5m']],['28×150',['5.5m']],
    // t=32
    ['32×50',['5.5m']],['32×65',['5.5m']],['32×75',['5.5m']],['32×90',['5.5m']],
    ['32×100',['5.5m']],['32×125',['5.5m']],['32×150',['5.5m']],
    // t=36
    ['36×50',['5.5m']],['36×100',['5.5m']],['36×125',['5.5m']],['36×150',['5.5m']],
  ].map(([spec,lengths],i)=>({itemCategory:'平鋼',spec,availableLengths:lengths,sortOrder:300+i})),

  // ─── 平鋼（広幅）─── 全て 6m
  ...[
    '6×165','6×170','6×175','6×180','6×200','6×250','6×300',
    '9×160','9×165','9×170','9×175','9×180','9×190','9×200','9×250','9×300','9×350','9×400',
    '12×165','12×170','12×175','12×180','12×190','12×200','12×250','12×300','12×350','12×400',
    '16×180','16×200','16×250','16×300','16×350','16×400',
    '19×200','19×250','19×300','19×350','19×400',
    '22×200','22×250','22×300','22×400',
    '25×200','25×250','25×300','28×200','32×200','32×300',
  ].map((spec,i)=>({itemCategory:'平鋼（広幅）',spec,availableLengths:['6m'],sortOrder:400+i})),

  // ─── 角パイプ（一般構造用・正方形）───
  ...[
    ['1.6×50×50',['6m']],['2.3×50×50',['6m','8m']],['3.2×50×50',['6m','8m']],['4.5×50×50',['6m']],
    ['1.6×60×60',['6m']],['2.3×60×60',['6m','8m']],['3.2×60×60',['6m','8m']],
    ['2.3×75×75',['6m','8m']],['3.2×75×75',['6m','8m']],
    ['2.3×80×80',['6m']],['3.2×80×80',['6m']],['3.2×90×90',['6m']],
    ['2.3×100×100',['6m','8m','10m']],['3.2×100×100',['6m','8m','10m']],
    ['4.5×100×100',['6m','8m','10m']],['6.0×100×100',['6m','8m','10m']],['9.0×100×100',['6m','8m']],
    ['3.2×125×125',['6m','8m']],['4.5×125×125',['6m','8m']],['6.0×125×125',['6m','8m','10m']],['9.0×125×125',['6m','8m']],
    ['4.5×150×150',['6m','8m','10m']],['6.0×150×150',['6m','8m','10m']],
    ['6.0×175×175',['6m','8m','10m']],['9.0×175×175',['6m','8m','10m']],
  ].map(([spec,lengths],i)=>({itemCategory:'角パイプ',spec,availableLengths:lengths,sortOrder:500+i})),

  // ─── 角パイプ（一般構造用・長方形）───
  ...[
    ['1.6×60×30',['6m']],['2.3×75×45',['6m','8m']],['3.2×75×45',['6m']],
    ['2.3×100×50',['6m','8m']],['3.2×100×50',['6m','8m']],['4.5×100×50',['6m']],
    ['2.3×125×75',['6m','8m']],['3.2×125×75',['6m','8m']],['4.5×125×75',['6m']],['6.0×125×75',['6m']],
    ['3.2×150×75',['6m','8m']],['4.5×150×75',['6m','8m']],
    ['3.2×150×100',['6m','8m']],['4.5×150×100',['6m','8m']],['6.0×150×100',['6m','8m']],
    ['4.5×200×100',['6m','8m']],['6.0×200×100',['6m','8m']],['9.0×200×100',['6m','8m','10m']],
    ['4.5×200×150',['6m']],['6.0×200×150',['6m','8m']],
  ].map(([spec,lengths],i)=>({itemCategory:'角パイプ（長方形）',spec,availableLengths:lengths,sortOrder:550+i})),

  // ─── 小径角管（正方形）───
  ...[
    ['1.2×11×11',['6m']],['1.6×13×13',['5.5m']],['1.2×14×14',['5.5m','6m']],
    ['1.2×16×16',['5.5m']],['1.6×16×16',['5.5m']],
    ['1.2×19×19',['5.5m']],['1.6×19×19',['5.5m']],['1.6×21×21',['5.5m']],
    ['1.6×24×24',['5.5m']],['1.2×25×25',['5.5m']],['1.6×28×28',['5.5m']],
    ['1.6×31×31R',['5.5m']],['1.6×32×32',['5.5m']],['1.6×38×38',['5.5m']],
    ['1.6×40×40R',['5.5m']],['2.0×40×40',['6m']],['1.6×45×45',['5.5m']],
  ].map(([spec,lengths],i)=>({itemCategory:'小径角管',spec,availableLengths:lengths,sortOrder:580+i})),

  // ─── 鋼管・丸パイプ（STK）───
  ...[
    ['(15A) 1.9×21.7',['5.5m']],['(20A) 1.9×27.2',['5.5m']],['(20A) 2.3×27.2',['5.5m']],
    ['(25A) 1.6×34.0',['5.5m']],['(25A) 1.9×34.0',['5.5m']],['(25A) 2.3×34.0',['5.5m']],
    ['(32A) 2.3×42.7',['5.5m']],['(40A) 2.3×48.6',['5.5m']],['(40A) 3.2×48.6',['6m']],
    ['(50A) 2.3×60.5',['5.5m']],['(50A) 2.8×60.5',['5.5m']],['(50A) 3.2×60.5',['6m']],
    ['(65A) 2.8×76.3',['5.5m']],['(65A) 3.2×76.3',['6m']],
    ['(80A) 2.8×89.1',['5.5m']],['(80A) 3.2×89.1',['6m']],
    ['(90A) 3.2×101.6',['5.5m']],['(100A) 3.5×114.3',['5.5m']],
    ['(125A) 3.5×139.8',['5.5m']],['(150A) 3.7×165.2',['5.5m']],['(150A) 4.5×165.2',['6m']],
    ['(200A) 4.5×216.3',['5.5m']],['(250A) 5.8×267.4',['6m']],
  ].map(([spec,lengths],i)=>({itemCategory:'鋼管（STK）',spec,availableLengths:lengths,sortOrder:600+i})),

  // ─── SGP（配管用炭素鋼管）───
  ...[
    '6A(1/8)','8A(1/4)','10A(3/8)','15A(1/2)','20A(3/4)',
    '25A(1)','32A(1.1/4)','40A(1.1/2)','50A(2)','65A(2.1/2)',
    '80A(3)','90A(3.1/2)','100A(4)','125A(5)','150A(6)',
    '175A(7)','200A(8)','225A(9)','250A(10)','300A(12)',
    '350A(14)','400A(16)','450A(18)','500A(20)',
  ].map((spec,i)=>({itemCategory:'鋼管（SGP）',spec,availableLengths:['5.5m'],sortOrder:650+i})),

  // ─── 丸パイプ（STKM）───
  ...[
    ['1.0×12.7',['5.5m']],['1.2×12.7',['5.5m']],['1.2×15.9',['5.5m']],['1.6×15.9',['5.5m']],
    ['1.2×19.1',['5.5m']],['1.6×19.1',['5.5m']],['1.2×22.2',['5.5m']],['1.6×22.2',['5.5m']],
    ['1.2×23.0',['5.5m']],['1.2×25.4',['5.5m']],['1.6×25.4',['5.5m']],
    ['1.2×28.6',['5.5m']],['1.6×28.6',['5.5m']],['2.8×28.6',['5.5m']],
    ['1.2×31.8',['5.5m']],['1.6×31.8',['5.5m']],
    ['1.2×38.1',['5.5m']],['1.6×38.1',['5.5m']],['1.6×50.8',['5.5m']],
  ].map(([spec,lengths],i)=>({itemCategory:'丸パイプ（STKM）',spec,availableLengths:lengths,sortOrder:700+i})),
];

// ===== カタログシードデータ V2（磨き材 + ステンレス） =====
const CATALOG_SEED_V2 = [
  // ─── 磨き丸鋼 (steel) ───
  ...[
    ['φ2',['2m']],['φ4',['2m']],['φ5',['2m']],['φ6',['2m']],
    ['φ7',['3m','4m']],
    ...['8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','24','25','26','28'].map(d=>[`φ${d}`,['4m']]),
    ['φ30',['4m','6m']],
    ...['32','35','38','40','45','50','55','60','65','70','75','80','90','100'].map(d=>[`φ${d}`,['6m']]),
  ].map(([spec,lengths],i)=>({itemCategory:'磨き丸鋼',spec,availableLengths:lengths,materialType:'steel',sortOrder:750+i})),

  // ─── 磨き四角鋼 (steel) ───
  ...[
    ...['2','3','4','5','6'].map(d=>[`${d}×${d}`,['2m']]),
    ['7×7',['3m','4m']],
    ...['8','9','10'].map(d=>[`${d}×${d}`,['3m']]),
    ...['11','12','13','14','15','16','17','18','19','20','22','25','28','30','32','35','38','40','45','50'].map(d=>[`${d}×${d}`,['4m']]),
    ...['55','60','65','70','75','80','90','100'].map(d=>[`${d}×${d}`,['3.5m']]),
  ].map(([spec,lengths],i)=>({itemCategory:'磨き四角鋼',spec,availableLengths:lengths,materialType:'steel',sortOrder:800+i})),

  // ─── 磨き平鋼 (steel) 厚×幅 ───
  ...[
    ...['6','9','12','16','19','25','32','38','50'].map(w=>[`3×${w}`,['2m']]),
    ...['6','9','12','16','19','25','32','38','50','65','75'].map(w=>[`4×${w}`,['2m','3m']]),
    ...['6','9','12','16','19','25','32','38','50','65','75','100'].map(w=>[`5×${w}`,['3m']]),
    ...['6','9','12','16','19','25','32','38','50','65','75','100','125','150'].map(w=>[`6×${w}`,['3m','4m']]),
    ...['9','12','16','19','25','32','38','50','65','75','100','125','150'].map(w=>[`9×${w}`,['3m','4m']]),
    ...['12','16','19','25','32','38','50','65','75','100','125','150'].map(w=>[`12×${w}`,['4m']]),
    ...['16','19','25','32','38','50','65','75','100','125','150'].map(w=>[`16×${w}`,['4m']]),
    ...['19','25','32','38','50','65','75','100','150'].map(w=>[`19×${w}`,['4m']]),
    ...['25','32','38','50','65','75','100','150'].map(w=>[`25×${w}`,['4m']]),
    ...['32','38','50','65','75','100','150'].map(w=>[`32×${w}`,['4m']]),
    ...['38','50','65','75','100','150'].map(w=>[`38×${w}`,['4m']]),
    ...['50','65','75','100','150'].map(w=>[`50×${w}`,['4m']]),
  ].map(([spec,lengths],i)=>({itemCategory:'磨き平鋼',spec,availableLengths:lengths,materialType:'steel',sortOrder:850+i})),

  // ─── SUS角パイプ（正方形）(stainless) ───
  ...[
    ['7×7',['4m']],['10×10',['4m']],['12×12',['4m']],['13×13',['4m']],['15×15',['4m']],
    ['16×16',['4m']],['19×19',['4m']],['20×20',['4m']],['22×22',['4m']],['25×25',['4m']],
    ['30×30',['4m']],['32×32',['4m']],['35×35',['4m']],['38×38',['4m']],['40×40',['4m']],
    ['45×45',['4m']],['50×50',['4m','6m']],['60×60',['4m','6m']],['65×65',['5m','6m']],
    ['70×70',['5m','6m']],['75×75',['5m','6m']],['80×80',['5m','6m']],
    ['90×90',['5m','6m']],['100×100',['5m','6m']],
  ].map(([spec,lengths],i)=>({itemCategory:'角パイプ（SUS正方形）',spec,availableLengths:lengths,materialType:'stainless',sortOrder:1000+i})),

  // ─── SUS角パイプ（長方形）(stainless) ───
  ...[
    ['19×10',['4m']],['20×10',['4m']],['20×15',['4m']],['25×12',['4m']],['25×15',['4m']],
    ['25×20',['4m']],['30×15',['4m']],['30×20',['4m']],['30×25',['4m']],['35×20',['4m']],
    ['40×20',['4m']],['40×25',['4m']],['40×30',['4m']],['50×20',['4m']],['50×25',['4m']],
    ['50×30',['4m']],['50×40',['4m']],['60×30',['4m']],['60×40',['4m']],['75×50',['4m']],
    ['80×40',['4m']],['80×60',['4m']],['100×50',['4m','5m']],['100×60',['4m','5m']],
    ['100×75',['5m']],['120×60',['5m']],['120×80',['5m']],['150×50',['5m']],['150×100',['5m']],
  ].map(([spec,lengths],i)=>({itemCategory:'角パイプ（SUS長方形）',spec,availableLengths:lengths,materialType:'stainless',sortOrder:1050+i})),

  // ─── SUS化粧パイプ (stainless) ───
  ...[
    // SUS304
    ['φ5.0(SUS304)',['4m']],['φ6.35(SUS304)',['4m']],['φ8.0(SUS304)',['4m']],
    ['φ9.52(SUS304)',['4m']],['φ12.7(SUS304)',['4m']],['φ15.88(SUS304)',['4m']],
    ['φ19.05(SUS304)',['4m']],['φ22.22(SUS304)',['4m']],['φ25.4(SUS304)',['4m']],
    ['φ28.58(SUS304)',['4m']],['φ31.75(SUS304)',['4m']],['φ34.0(SUS304)',['4m']],
    ['φ38.1(SUS304)',['4m']],['φ42.7(SUS304)',['4m']],['φ48.6(SUS304)',['4m']],
    ['φ50.8(SUS304)',['4m']],['φ57.15(SUS304)',['4m']],['φ60.5(SUS304)',['4m']],
    ['φ63.5(SUS304)',['4m']],['φ76.3(SUS304)',['4m']],['φ89.1(SUS304)',['4m']],
    ['φ101.6(SUS304)',['4m']],['φ114.3(SUS304)',['4m']],['φ165.2(SUS304)',['4m']],
    // SUS430
    ['φ19(SUS430)',['4m']],['φ22(SUS430)',['4m']],['φ25(SUS430)',['4m']],
    ['φ28(SUS430)',['4m']],['φ32(SUS430)',['4m']],['φ38(SUS430)',['4m']],
  ].map(([spec,lengths],i)=>({itemCategory:'化粧パイプ（SUS）',spec,availableLengths:lengths,materialType:'stainless',sortOrder:1100+i})),

  // ─── SUSフラットバー (stainless) 厚×幅 ───
  ...[
    ...['6','9','12','16','19','25','32','38','50'].map(w=>[`2×${w}`,['4m']]),
    ...['6','9','12','16','19','25','32','38','50','65','75','100'].map(w=>[`3×${w}`,['4m']]),
    ...['6','9','12','16','19','25','32','38','50','65','75','100'].map(w=>[`4×${w}`,['4m']]),
    ...['6','9','12','16','19','25','32','38','50','65','75','100','125','150'].map(w=>[`5×${w}`,['4m']]),
    ...['9','12','16','19','25','32','38','50','65','75','100','125','150'].map(w=>[`6×${w}`,['4m']]),
    ...['12','16','19','25','32','38','50','65','75','100','125','150'].map(w=>[`8×${w}`,['4m']]),
    ...['16','19','25','32','38','50','65','75','100','125','150'].map(w=>[`10×${w}`,['4m']]),
    ...['19','25','32','38','50','65','75','100','150'].map(w=>[`12×${w}`,['4m']]),
    ...['25','32','38','50','65','75','100','150'].map(w=>[`16×${w}`,['4m']]),
    ...['25','32','38','50','65','75','100','150'].map(w=>[`19×${w}`,['4m']]),
    ...['32','38','50','65','75','100','150'].map(w=>[`25×${w}`,['4m']]),
    ...['38','50','65','75','100','150'].map(w=>[`32×${w}`,['4m']]),
    ...['50','65','75','100','150'].map(w=>[`38×${w}`,['4m']]),
    ...['65','75','100','150'].map(w=>[`50×${w}`,['4m']]),
    ['75×100',['4m']],['75×150',['4m']],['100×150',['4m']],
  ].map(([spec,lengths],i)=>({itemCategory:'フラットバー（SUS）',spec,availableLengths:lengths,materialType:'stainless',sortOrder:1150+i})),

  // ─── SUS角棒 (stainless) ───
  ...[
    ['3×3',['2m']],['4×4',['2m']],['5×5',['2m']],
    ...['6','7','8'].map(d=>[`${d}×${d}`,['2m','4m']]),
    ...['9','10','11','12','13','14','15','16','17','18','19','20','22','25','28','30','32',
        '35','38','40','45','50','55','60','65','70','75','80','90','100'].map(d=>[`${d}×${d}`,['4m']]),
  ].map(([spec,lengths],i)=>({itemCategory:'角棒（SUS）',spec,availableLengths:lengths,materialType:'stainless',sortOrder:1300+i})),

  // ─── SUS配管パイプ TP-A (stainless) ───
  ...[
    ['6A',['4m']],['8A',['4m']],['10A',['4m']],['15A',['4m']],['20A',['4m']],
    ['25A',['4m']],['32A',['4m']],['40A',['4m']],['50A',['4m']],['65A',['4m']],
    ['80A',['4m']],['90A',['4m']],['100A',['4m']],['125A',['4m']],['150A',['4m']],
    ['200A',['4m']],['250A',['4m']],['300A',['4m']],
  ].map(([spec,lengths],i)=>({itemCategory:'配管パイプ TP-A（SUS）',spec,availableLengths:lengths,materialType:'stainless',sortOrder:1350+i})),

  // ─── SUS屋内配管 (stainless) ───
  ...[
    ['13',['4m']],['20',['4m']],['25',['4m']],['32',['4m']],['40',['4m']],
    ['50',['4m']],['65',['4m']],['75',['4m']],['100',['4m']],['125',['4m']],
    ['150',['4m']],['200',['4m']],['250',['4m']],['300',['4m']],
  ].map(([spec,lengths],i)=>({itemCategory:'屋内配管（SUS）',spec,availableLengths:lengths,materialType:'stainless',sortOrder:1400+i})),

  // ─── SUSアングル (stainless) ───
  ...[
    ['3×20×20',['4m']],['3×25×25',['4m']],['3×30×30',['4m']],['3×40×40',['4m']],
    ['3×50×50',['4m','6m']],['4×25×25',['4m']],['4×30×30',['4m']],['4×40×40',['4m']],
    ['4×50×50',['4m','6m']],['4×65×65',['4m','6m']],['4×75×75',['4m','6m']],
    ['5×40×40',['4m']],['5×50×50',['4m','6m']],['5×65×65',['4m','6m']],
    ['5×75×75',['4m','6m']],['5×100×100',['4m','6m']],
    ['6×50×50',['4m','6m']],['6×65×65',['4m','6m']],['6×75×75',['4m','6m']],
    ['6×100×100',['4m','6m']],['6×150×150',['6m']],
    ['8×65×65',['4m','6m']],['8×75×75',['4m','6m']],['8×100×100',['4m','6m']],
    ['8×150×150',['6m']],
    ['10×75×75',['4m','6m']],['10×100×100',['4m','6m']],['10×150×150',['6m']],
    ['12×100×100',['4m','6m']],['12×150×150',['6m']],
  ].map(([spec,lengths],i)=>({itemCategory:'アングル（SUS）',spec,availableLengths:lengths,materialType:'stainless',sortOrder:1450+i})),

  // ─── SUS丸棒 (stainless) ───
  ...[
    ...['8','10','12','13','14','15'].map(d=>[`φ${d}`,['4m']]),
    ...['16','18','19','20','22','25'].map(d=>[`φ${d}`,['4m','6m']]),
    ...['26','28','30','32','35','38','40','45','50','55','60','65','70','75','80','90','100'].map(d=>[`φ${d}`,['6m']]),
  ].map(([spec,lengths],i)=>({itemCategory:'丸棒（SUS）',spec,availableLengths:lengths,materialType:'stainless',sortOrder:1500+i})),
];

// ===== 工場在庫 固定品目（V4） =====
const CATALOG_SEED_V4 = [
  { itemCategory: '丸パイプ',       spec: '1.6×19.1φ', materialType: 'steel', availableLengths: ['5.5m'], sortOrder: 2000, defaultQty: 10 },
  { itemCategory: '丸パイプ',       spec: '1.6×25.4φ', materialType: 'steel', availableLengths: ['5.5m'], sortOrder: 2001, defaultQty: 10 },
  { itemCategory: '丸鋼(クロ)',     spec: 'φ6',        materialType: 'steel', availableLengths: ['5.5m'], sortOrder: 2002, defaultQty: 50 },
  { itemCategory: '異形丸鋼',       spec: 'D10',        materialType: 'steel', availableLengths: ['6m'],   sortOrder: 2003, defaultQty: 60 },
  { itemCategory: '平鋼(クロ)',     spec: '6×90',       materialType: 'steel', availableLengths: ['5.5m'], sortOrder: 2004, defaultQty: 4  },
  { itemCategory: '平鋼(クロ)',     spec: '4.5×38',     materialType: 'steel', availableLengths: ['5.5m'], sortOrder: 2005, defaultQty: 15 },
  { itemCategory: 'アングル(クロ)', spec: '3×30×30',   materialType: 'steel', availableLengths: ['5.5m'], sortOrder: 2006, defaultQty: 1  },
  { itemCategory: '磨き丸鋼',       spec: 'φ8',        materialType: 'steel', availableLengths: ['4m'],   sortOrder: 2007, defaultQty: 30 },
];

// ===== Firestore 初期データ投入 =====
async function seedInitialData() {
  try {
    // 発注先の初期化
    const suppSnap = await getDocs(collection(db, 'order_suppliers'));
    if (suppSnap.empty) {
      await addDoc(collection(db, 'order_suppliers'), {
        name: '土屋鋼材株式会社',
        email: 'info@tsuchiyakouzai.com',
        tel: '027-346-4700',
        address: '〒370-1201 群馬県高崎市倉賀野町2459-11',
        active: true,
        createdAt: serverTimestamp()
      });
    }

    // バージョン確認
    const configSnap = await getDoc(doc(db, 'portal', 'config'));
    let seedVer = configSnap.exists() ? (configSnap.data().orderItemsSeedVersion || 0) : 0;

    // ── V1: スチール鋼材カタログ ──
    if (seedVer < 1) {
      const suppSnap2 = await getDocs(collection(db, 'order_suppliers'));
      const suppId = suppSnap2.docs[0]?.id || '';
      await Promise.all(CATALOG_SEED.map(item => addDoc(collection(db, 'order_items'), {
        itemCategory: item.itemCategory,
        name: item.itemCategory,
        spec: item.spec,
        materialType: 'steel',
        availableLengths: item.availableLengths,
        unit: '本',
        defaultQty: 1,
        supplierId: suppId,
        sortOrder: item.sortOrder,
        orderType: 'both',
        active: true
      })));
      await setDoc(doc(db, 'portal', 'config'), { orderItemsSeedVersion: 1 }, { merge: true });
      console.log(`order: ${CATALOG_SEED.length}件のV1品目をシードしました`);
      seedVer = 1;
    }

    // ── V2: 磨き材 + ステンレス ──
    if (seedVer < 2) {
      const suppSnap3 = await getDocs(collection(db, 'order_suppliers'));
      const suppId2 = suppSnap3.docs[0]?.id || '';
      await Promise.all(CATALOG_SEED_V2.map(item => addDoc(collection(db, 'order_items'), {
        itemCategory: item.itemCategory,
        name: item.itemCategory,
        spec: item.spec,
        materialType: item.materialType || 'steel',
        availableLengths: item.availableLengths,
        unit: '本',
        defaultQty: 1,
        supplierId: suppId2,
        sortOrder: item.sortOrder,
        orderType: 'both',
        active: true
      })));
      await setDoc(doc(db, 'portal', 'config'), { orderItemsSeedVersion: 2 }, { merge: true });
      console.log(`order: ${CATALOG_SEED_V2.length}件のV2品目をシードしました`);
    }

    // ── V3: 旧工場在庫（廃止 → V4へ移行） ──
    if (seedVer < 3) {
      await setDoc(doc(db, 'portal', 'config'), { orderItemsSeedVersion: 3 }, { merge: true });
    }

    // ── V4: 工場在庫 固定8品目（品目・数量を正式版に更新） ──
    if (seedVer < 4) {
      // 既存のfactory品目をすべて削除してから新規追加
      const oldFactory = await getDocs(
        query(collection(db, 'order_items'), where('orderType', '==', 'factory'))
      );
      if (!oldFactory.empty) {
        await Promise.all(oldFactory.docs.map(d => deleteDoc(doc(db, 'order_items', d.id))));
      }
      await Promise.all(CATALOG_SEED_V4.map(item => addDoc(collection(db, 'order_items'), {
        itemCategory: item.itemCategory,
        name: item.itemCategory,
        spec: item.spec,
        materialType: item.materialType,
        availableLengths: item.availableLengths,
        unit: '本',
        defaultQty: item.defaultQty,
        sortOrder: item.sortOrder,
        orderType: 'factory',
        active: true
      })));
      await setDoc(doc(db, 'portal', 'config'), { orderItemsSeedVersion: 4 }, { merge: true });
      console.log(`order: ${CATALOG_SEED_V4.length}件のV4工場在庫品目をシードしました`);
    }
  } catch (err) {
    console.error('order: seedInitialData error', err);
  }
}

// ===== 工場在庫品目の重複削除（多重シード対策） =====
async function cleanupFactoryDuplicates() {
  try {
    const snap = await getDocs(
      query(collection(db, 'order_items'), where('orderType', '==', 'factory'))
    );
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    const seen = new Map();
    const toDelete = [];
    items.forEach(it => {
      const key = `${it.itemCategory}__${it.spec}`;
      if (seen.has(key)) {
        toDelete.push(it.id);
      } else {
        seen.set(key, it.id);
      }
    });

    if (toDelete.length > 0) {
      await Promise.all(toDelete.map(id => deleteDoc(doc(db, 'order_items', id))));
      console.log(`order: ${toDelete.length}件の重複工場在庫品目を削除しました`);
    }
  } catch (err) {
    console.error('order: cleanupFactoryDuplicates error', err);
  }
}

// ===== マスタ読み込み =====
async function loadMasters() {
  try {
    const [suppSnap, itemSnap, configSnap] = await Promise.all([
      getDocs(query(collection(db, 'order_suppliers'), where('active', '==', true))),
      getDocs(query(collection(db, 'order_items'), orderBy('sortOrder'))),
      getDoc(doc(db, 'portal', 'config'))
    ]);
    _suppliers = suppSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    _items = itemSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (configSnap.exists()) {
      _gasUrl = configSnap.data().gasOrderUrl || '';
    }
  } catch (err) {
    console.error('order: loadMasters error', err);
  }
}

// ===== 初期化 =====
export async function initOrder(d) {
  // d は deps（将来の拡張用）
  await seedInitialData();
  await cleanupFactoryDuplicates();
  await loadMasters();
  bindOrderEvents();
}

// ===== 20日締め期間計算 =====
function getPeriod(offset = 0) {
  const now = new Date();
  const day20 = new Date(now.getFullYear(), now.getMonth(), 20);
  let endYear = now.getFullYear();
  let endMonth = now.getMonth(); // 0-indexed
  if (now > day20) {
    endMonth += 1;
  }
  endMonth += offset;
  endYear += Math.floor(endMonth / 12);
  endMonth = ((endMonth % 12) + 12) % 12;

  const end = new Date(endYear, endMonth, 20, 23, 59, 59, 999);
  const start = new Date(endYear, endMonth - 1, 21, 0, 0, 0, 0);

  return { start, end };
}

function fmtPeriodLabel(period) {
  const s = period.start;
  const e = period.end;
  return `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日 〜 ${e.getFullYear()}年${e.getMonth() + 1}月${e.getDate()}日`;
}

// ===== 日付フォーマット =====
const WEEK_DAYS = ['日', '月', '火', '水', '木', '金', '土'];
function fmtDatetime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const wd = WEEK_DAYS[d.getDay()];
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${wd}）${pad(d.getHours())}時${pad(d.getMinutes())}分`;
}

function toDateValue(value) {
  if (!value) return null;
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isOrderDeleted(order) {
  return Boolean(order?.deletedAt);
}

function findOrderById(orderId) {
  return _historyOrders.find(o => o.id === orderId) || _deletedHistoryOrders.find(o => o.id === orderId) || null;
}

function getOrderHistoryProjectFilterValue() {
  return normalizeProjectKey(state.orderHistoryProjectKeyFilter || '').toLowerCase();
}

function filterOrdersByProjectKey(list) {
  const filter = getOrderHistoryProjectFilterValue();
  if (!filter) return list;
  return list.filter(order => normalizeProjectKey(order.projectKey || '').toLowerCase().includes(filter));
}

function updateOrderHistoryFilterUi(totalCount, filteredCount) {
  const input = document.getElementById('ord-history-project-filter');
  const clearBtn = document.getElementById('ord-history-project-filter-clear');
  const countEl = document.getElementById('ord-history-project-filter-count');
  if (input && input.value !== (state.orderHistoryProjectKeyFilter || '')) {
    input.value = state.orderHistoryProjectKeyFilter || '';
  }
  if (clearBtn) clearBtn.hidden = !state.orderHistoryProjectKeyFilter;
  if (countEl) {
    countEl.textContent = state.orderHistoryProjectKeyFilter
      ? `${filteredCount} / ${totalCount}件`
      : `${totalCount}件`;
  }
}

function getOrderTypeMeta(order) {
  const isFactory = !order.orderType || order.orderType === 'factory';
  return {
    label: isFactory ? '工場在庫' : (order.siteName || '現場名発注'),
    className: isFactory ? 'ord-type-badge--factory' : 'ord-type-badge--site'
  };
}

function getOrderItemsSummary(order) {
  return (order.items || []).map(it => {
    const nm = it.category || it.name || '';
    const fin = it.finish ? ` ${it.finish}` : '';
    const len = it.length ? ` L=${it.length}` : '';
    return `${nm}${it.spec ? ' ' + it.spec : ''}${fin}${len} ${it.qty}${it.unit || '本'}`;
  }).join('、');
}

function buildStoredOrderData(data, { emailSent = false } = {}) {
  return {
    supplierId: data.supplierId,
    supplierName: data.supplierName,
    supplierEmail: data.supplierEmail,
    orderType: data.orderType,
    siteName: data.siteName,
    projectKey: data.projectKey || '',
    items: data.items,
    orderedBy: data.orderedBy,
    note: data.note,
    orderedAt: serverTimestamp(),
    emailSent,
    emailSentAt: emailSent ? serverTimestamp() : null,
    deletedAt: null,
    deletedBy: null
  };
}

function renderHistoryItem(order, { deleted = false } = {}) {
  const { label: typeLabel, className: typeCls } = getOrderTypeMeta(order);
  const itemsSummary = getOrderItemsSummary(order);
  const projectKeyHtml = order.projectKey
    ? `<div class="ord-history-project"><span class="ord-history-project-label">物件No</span><span class="ord-project-key-chip">${esc(order.projectKey)}</span></div>`
    : '';
  const emailBadge = order.emailSent
    ? `<span class="ord-email-badge ord-email-badge--sent"><i class="fa-solid fa-envelope-circle-check"></i> 送信済み</span>`
    : `<span class="ord-email-badge ord-email-badge--unsent"><i class="fa-solid fa-envelope"></i> 未送信</span>`;
  const deletedBadge = deleted
    ? '<span class="ord-history-deleted-badge"><i class="fa-solid fa-trash-can"></i> 削除済み</span>'
    : '';
  const deletedMeta = deleted
    ? `<div class="ord-history-deleted-note"><i class="fa-solid fa-rotate-left"></i> ${fmtDatetime(order.deletedAt)} に ${esc(order.deletedBy || '不明')} が削除</div>`
    : '';
  const actionButtons = deleted
    ? `
        <button class="ord-history-action-btn ord-history-detail-btn" data-id="${esc(order.id)}"><i class="fa-solid fa-file-lines"></i> 詳細</button>
        <button class="ord-history-action-btn ord-history-restore-btn" data-id="${esc(order.id)}"><i class="fa-solid fa-rotate-left"></i> 元に戻す</button>`
    : `
        <button class="ord-history-action-btn ord-history-detail-btn" data-id="${esc(order.id)}"><i class="fa-solid fa-file-lines"></i> 詳細</button>
        <button class="ord-history-action-btn ord-history-delete-btn" data-id="${esc(order.id)}"><i class="fa-solid fa-trash"></i> 削除</button>`;

  return `
    <div class="ord-history-item${deleted ? ' ord-history-item--deleted' : ''}" data-id="${esc(order.id)}">
      <div class="ord-history-header">
        <span class="ord-history-date">${fmtDatetime(order.orderedAt)}</span>
        <span class="ord-type-badge ${typeCls}">${esc(typeLabel)}</span>
        <span class="ord-history-by">${esc(order.orderedBy || '')}</span>
        ${emailBadge}
        ${deletedBadge}
      </div>
      <div class="ord-history-items">${esc(itemsSummary)}</div>
      ${projectKeyHtml}
      ${order.note ? `<div class="ord-history-note">備考: ${esc(order.note)}</div>` : ''}
      ${deletedMeta}
      <div class="ord-history-detail-btn-row">${actionButtons}</div>
    </div>`;
}

// ===== メール本文組み立て =====
function buildEmailContent(orderData) {
  const supplier = _suppliers.find(s => s.id === orderData.supplierId) || {
    name: orderData.supplierName,
    email: orderData.supplierEmail
  };

  const now = orderData.orderedAt instanceof Date ? orderData.orderedAt : new Date();
  const wd = WEEK_DAYS[now.getDay()];
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${wd}）${pad(now.getHours())}時${pad(now.getMinutes())}分`;

  const typeLabel = orderData.orderType === 'site' ? '現場名発注' : '工場在庫';
  const siteInfo  = orderData.orderType === 'site' && orderData.siteName
    ? `現場名　：${orderData.siteName}\n` : '';
  const projectKeyInfo = orderData.projectKey ? `物件No：${orderData.projectKey}\n` : '';
  const projectKeySuffix = orderData.projectKey ? ` / ${orderData.projectKey}` : '';

  const subject = `【鋼材発注・${typeLabel}】${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日${projectKeySuffix} - 日建フレメックス株式会社 生産管理課`;

  const itemLines = orderData.items.map((item, i) => {
    const no = String(i + 1).padStart(2, ' ');
    const finishStr = item.finish ? `　${item.finish}` : '';
    const lengthStr = item.length ? `　L=${item.length}` : '';
    const label = `${item.category}　${item.spec}${finishStr}${lengthStr}`;
    return `${no}    ${label}      ${item.qty}本`;
  }).join('\n');

  const noteText = (orderData.note || '').trim() || 'なし';
  const supplierName = supplier.name || orderData.supplierName || '発注先';

  const body = `${supplierName}
ご担当者様

いつもお世話になっております。
日建フレメックス株式会社 生産管理課の髙林でございます。

以下の通り、鋼材のご発注をお願いいたします。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
発注日時：${dateStr}
発注担当：${orderData.orderedBy}
発注区分：${typeLabel}
${siteInfo}${projectKeyInfo}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【発注明細】
No.  品名・規格                    数量
────────────────────────────────────────
${itemLines}
────────────────────────────────────────

【備考】
${noteText}

どうぞよろしくお願いいたします。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
日建フレメックス株式会社
生産管理課　髙林
E-mail：takabayashi@framex.co.jp
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  return { subject, body, toEmail: supplier.email || orderData.supplierEmail, replyTo: NOTIFY_EMAIL };
}

// ===== メール送信 =====
const NOTIFY_EMAIL = 'takabayashi@framex.co.jp';

async function sendOrderEmail(orderData) {
  if (!_gasUrl) {
    alert('GAS URLが設定されていません。管理者に設定を依頼してください。');
    return false;
  }

  const { subject, body, toEmail, replyTo } = buildEmailContent(orderData);

  try {
    // 発注先へ送信（replyTo を設定することで返信先を担当者メールに）
    await fetch(_gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: toEmail, subject, body, replyTo })
    });

    // 担当者（髙林）へも同内容を送信（誰が発注したかわかるよう控えとして）
    await fetch(_gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: NOTIFY_EMAIL,
        subject: `【控え】${subject}`,
        body: `※ これは発注控えです。発注者：${orderData.orderedBy}\n\n${body}`
      })
    });

    return true;
  } catch (err) {
    console.error('order: sendOrderEmail error', err);
    alert('メール送信に失敗しました。\n' + err.message);
    return false;
  }
}

// ===== 印刷 =====
function printOrder(orderData) {
  const now = orderData.orderedAt instanceof Date ? orderData.orderedAt : new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const orderNo = orderData.orderId
    ? `ORD-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${orderData.orderId.slice(-3).toUpperCase()}`
    : `ORD-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-001`;

  const supplier = _suppliers.find(s => s.id === orderData.supplierId) || {
    name: orderData.supplierName || '土屋鋼材株式会社',
    address: '〒370-1201 群馬県高崎市倉賀野町2459-11',
    tel: '027-346-4700'
  };

  const itemRows = orderData.items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(item.category || item.name || '')}　${esc(item.spec)}${item.finish ? '　' + esc(item.finish) : ''}${item.length ? '　L=' + esc(item.length) : ''}</td>
      <td class="ord-print-qty">${item.qty}${esc(item.unit)}</td>
    </tr>`).join('');

  const noteText = (orderData.note || '').trim() || '（なし）';

  const area = document.getElementById('ord-print-area');
  if (!area) return;
  area.innerHTML = `
    <div class="ord-print-doc">
      <div class="ord-print-title">鋼 材 発 注 書</div>
      <table class="ord-print-meta">
        <tr><th>発注日時</th><td>${dateStr}</td></tr>
        <tr><th>発注番号</th><td>${orderNo}</td></tr>
        <tr><th>発注者</th><td>${esc(orderData.orderedBy)}（日建フレメックス株式会社 生産管理課）</td></tr>
        <tr><th>発注区分</th><td>${orderData.orderType === 'site' ? '現場名発注' : '工場在庫'}${orderData.siteName ? `　現場名：${esc(orderData.siteName)}` : ''}</td></tr>
        ${orderData.projectKey ? `<tr><th>物件No</th><td>${esc(orderData.projectKey)}</td></tr>` : ''}
      </table>
      <div class="ord-print-section-title">【発注先】</div>
      <div class="ord-print-supplier">
        <div>${esc(supplier.name)}</div>
        <div>${esc(supplier.address || '')}</div>
        <div>TEL: ${esc(supplier.tel || '')}</div>
      </div>
      <div class="ord-print-section-title">【発注明細】</div>
      <table class="ord-print-items">
        <thead>
          <tr><th>No.</th><th>品名・規格</th><th>数量</th></tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div class="ord-print-section-title">【備考】</div>
      <div class="ord-print-note">${esc(noteText)}</div>
      <div class="ord-print-footer">日建フレメックス株式会社 生産管理課</div>
    </div>`;

  area.hidden = false;
  window.print();
  area.hidden = true;
  area.innerHTML = '';
}

// ===== 発注区分切替 =====
function switchOrderType(type) {
  _orderType = type;
  ['factory', 'site'].forEach(t => {
    document.getElementById(`ord-type-${t}`)?.classList.toggle('active', t === type);
  });
  const siteGroup = document.getElementById('ord-site-name-group');
  if (siteGroup) siteGroup.hidden = (type !== 'site');
  renderOrderItemList();
}

// ===== ピン留め管理 =====
function loadPins() {
  try { _pins = JSON.parse(localStorage.getItem('portal-order-pins') || '[]'); } catch { _pins = []; }
}
function savePins() {
  localStorage.setItem('portal-order-pins', JSON.stringify(_pins));
}
function togglePin(itemId) {
  const idx = _pins.indexOf(itemId);
  if (idx >= 0) _pins.splice(idx, 1); else _pins.unshift(itemId);
  savePins();
  renderOrderItemList();
}

// ===== 最近使った品目 =====
function loadRecent() {
  try { _recent = JSON.parse(localStorage.getItem('portal-order-recent') || '[]'); } catch { _recent = []; }
}
function saveRecent(itemIds) {
  _recent = [...new Set([...itemIds, ..._recent])].slice(0, 10);
  localStorage.setItem('portal-order-recent', JSON.stringify(_recent));
}

// ===== 選択中サマリー =====
function renderSelectedSummary() {
  const el = document.getElementById('ord-selected-summary');
  if (!el) return;
  const selected = [];
  _checkedItems.forEach((saved, itemId) => {
    if (!saved.checked) return;
    const item = _items.find(it => it.id === itemId);
    if (!item) return;
    selected.push({ item, saved });
  });
  if (!selected.length) { el.hidden = true; return; }
  el.hidden = false;
  const chips = selected.map(({ item, saved }) => {
    const fin = saved.finish ? ` <span class="ord-sum-fin">${esc(saved.finish)}</span>` : '';
    const len = saved.length ? ` <span class="ord-sum-len">${esc(saved.length)}</span>` : '';
    return `<span class="ord-sum-chip">${esc(item.spec)}${fin}${len} <strong>×${saved.qty}本</strong></span>`;
  }).join('');
  el.innerHTML = `<div class="ord-sum-header"><i class="fa-solid fa-cart-shopping"></i> 選択中 <strong>${selected.length}</strong>品目</div><div class="ord-sum-chips">${chips}</div>`;
}

// ===== カテゴリフィルタドロップダウン =====
function renderCategoryTabs() {
  const sel = document.getElementById('ord-cat-select');
  if (!sel) return;
  const cats = [...new Set(
    _items.filter(it =>
      it.active !== false &&
      (_materialFilter === 'all' || (it.materialType || 'steel') === _materialFilter)
    ).map(it => it.itemCategory || it.name || '')
  )];
  sel.innerHTML = [
    `<option value="all">── カテゴリで絞り込む ──</option>`,
    ...cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`)
  ].join('');
  sel.value = _categoryFilter;
}

// ===== 品目行HTML生成 =====
function buildItemRow(item) {
  const id = item.id;
  const lengths = item.availableLengths || [];
  const lengthHtml = lengths.length > 1
    ? `<select class="ord-length-select form-input">${lengths.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('')}</select>`
    : `<span class="ord-item-fixed-length">${esc(lengths[0] || '')}</span>`;
  const isStainless = (item.materialType || 'steel') === 'stainless';
  const finishHtml = isStainless
    ? `<select class="ord-finish-select form-input"><option value="HL">HL</option><option value="#400">#400</option><option value="未研">未研</option></select>`
    : '';
  const isPinned = _pins.includes(id);
  return `
    <div class="ord-item-row" data-id="${esc(id)}">
      <button class="ord-pin-btn${isPinned ? ' pinned' : ''}" title="${isPinned ? 'ピン解除' : 'よく使う品目に登録'}">
        <i class="${isPinned ? 'fa-solid' : 'fa-regular'} fa-star"></i>
      </button>
      <input type="checkbox" class="ord-item-check" id="ord-chk-${esc(id)}">
      <label for="ord-chk-${esc(id)}" class="ord-item-label">
        <span class="ord-item-spec">${esc(item.spec)}</span>
      </label>
      ${finishHtml}
      ${lengthHtml}
      <input type="number" class="ord-qty-input form-input" value="${item.defaultQty || 1}" min="1" step="1">
    </div>`;
}

function switchMaterialFilter(type) {
  _materialFilter = type;
  _categoryFilter = 'all';
  document.querySelectorAll('#ord-material-tabs .ord-material-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  renderCategoryTabs();
  renderOrderItemList();
}

function renderOrderItemList() {
  const listEl = document.getElementById('ord-item-list');
  if (!listEl) return;
  renderSelectedSummary();

  const q = _searchQuery.toLowerCase().trim();

  // ── フィルタ適用 ──
  let filtered = _items.filter(it => {
    if (it.active === false) return false;
    // 工場在庫タブ: orderType='factory' の専用品目のみ表示
    // 現場名発注タブ: factory専用品目は除外（both / site / 未設定を表示）
    if (_orderType === 'factory') {
      if (it.orderType !== 'factory') return false;
    } else {
      if (it.orderType === 'factory') return false;
    }
    if (_materialFilter !== 'all' && (it.materialType || 'steel') !== _materialFilter) return false;
    if (_categoryFilter !== 'all' && (it.itemCategory || '') !== _categoryFilter) return false;
    if (q && !`${it.itemCategory || ''} ${it.spec || ''}`.toLowerCase().includes(q)) return false;
    if (_showSelectedOnly && !_checkedItems.get(it.id)?.checked) return false;
    return true;
  });

  // ── スペシャルセクション（検索・カテゴリ絞り・選択済みモード中は非表示）──
  const showSpecial = !q && _categoryFilter === 'all' && !_showSelectedOnly;
  const _matchesOrderTab = it => _orderType === 'factory' ? it.orderType === 'factory' : it.orderType !== 'factory';
  const pinnedItems = showSpecial
    ? _pins.map(id => _items.find(it => it.id === id)).filter(Boolean)
        .filter(it => it.active !== false && _matchesOrderTab(it) &&
          (_materialFilter === 'all' || (it.materialType || 'steel') === _materialFilter))
    : [];
  const pinnedIds = new Set(pinnedItems.map(it => it.id));
  const recentItems = showSpecial
    ? _recent.map(id => _items.find(it => it.id === id)).filter(Boolean)
        .filter(it => it.active !== false && !pinnedIds.has(it.id) && _matchesOrderTab(it) &&
          (_materialFilter === 'all' || (it.materialType || 'steel') === _materialFilter))
    : [];
  const specialIds = new Set([...pinnedIds, ...recentItems.map(it => it.id)]);
  filtered = filtered.filter(it => !specialIds.has(it.id));

  if (!filtered.length && !pinnedItems.length && !recentItems.length) {
    listEl.innerHTML = `<p class="ord-empty">該当する鋼材が見つかりません</p>`;
    return;
  }

  let html = '';

  // ── ⭐ よく使う品目 ──
  if (pinnedItems.length) {
    html += `<div class="ord-special-section">
      <div class="ord-special-header"><i class="fa-solid fa-star"></i> よく使う品目</div>
      ${pinnedItems.map(buildItemRow).join('')}
    </div>`;
  }

  // ── 🕐 最近使った品目 ──
  if (recentItems.length) {
    html += `<div class="ord-special-section">
      <div class="ord-special-header"><i class="fa-solid fa-clock-rotate-left"></i> 最近使った品目</div>
      ${recentItems.map(buildItemRow).join('')}
    </div>`;
  }

  // ── カテゴリグループ ──
  if (filtered.length) {
    const grouped = {};
    filtered.forEach(item => {
      const cat = item.itemCategory || item.name || '鋼材';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    const expandAll = q.length > 0;
    html += Object.entries(grouped).map(([cat, items]) => `
      <div class="ord-cat-group">
        <div class="ord-cat-header" data-cat="${esc(cat)}">
          <i class="fa-solid fa-chevron-down ord-cat-chevron" style="${expandAll ? '' : 'transform:rotate(-90deg)'}"></i>
          <span class="ord-cat-name">${esc(cat)}</span>
          <span class="ord-cat-count">${items.length}種</span>
        </div>
        <div class="ord-cat-items${expandAll ? '' : ' collapsed'}">
          ${items.map(buildItemRow).join('')}
        </div>
      </div>`).join('');
  }

  listEl.innerHTML = html;

  // カテゴリ折りたたみイベント
  listEl.querySelectorAll('.ord-cat-header').forEach(header => {
    header.addEventListener('click', () => {
      const itemsEl = header.nextElementSibling;
      const chevron = header.querySelector('.ord-cat-chevron');
      const collapsed = itemsEl.classList.toggle('collapsed');
      chevron.style.transform = collapsed ? 'rotate(-90deg)' : '';
    });
  });

  // チェック状態復元 + 変更イベント
  listEl.querySelectorAll('.ord-item-row[data-id]').forEach(row => {
    const id = row.dataset.id;
    const saved = _checkedItems.get(id);
    const chk = row.querySelector('.ord-item-check');
    const qtyEl = row.querySelector('.ord-qty-input');
    const lenEl = row.querySelector('.ord-length-select');
    const fixedLen = row.querySelector('.ord-item-fixed-length');
    const finEl = row.querySelector('.ord-finish-select');
    if (saved) {
      if (chk) chk.checked = saved.checked;
      if (qtyEl && saved.qty != null) qtyEl.value = saved.qty;
      if (lenEl && saved.length) lenEl.value = saved.length;
      if (finEl && saved.finish) finEl.value = saved.finish;
    }
    const sync = () => {
      _checkedItems.set(id, {
        checked: chk?.checked || false,
        qty: parseInt(qtyEl?.value, 10) || 1,
        length: lenEl?.value || fixedLen?.textContent?.trim() || '',
        finish: finEl?.value || ''
      });
      renderSelectedSummary();
      if (_showSelectedOnly) renderOrderItemList();
    };
    chk?.addEventListener('change', sync);
    qtyEl?.addEventListener('change', sync);
    lenEl?.addEventListener('change', sync);
    finEl?.addEventListener('change', sync);
    // ピンボタン
    row.querySelector('.ord-pin-btn')?.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); togglePin(id);
    });
  });
}

// ===== 発注モーダル =====
export async function openOrderModal() {
  await loadMasters();
  loadPins();
  loadRecent();

  const modal = document.getElementById('ord-modal');
  if (!modal) return;

  // 発注先プルダウンを構築
  const sel = document.getElementById('ord-supplier-select');
  if (sel) {
    sel.innerHTML = _suppliers.length
      ? _suppliers.map(s => `<option value="${esc(s.id)}">${esc(s.name)}　${esc(s.email)}</option>`).join('')
      : '<option value="">（発注先が登録されていません）</option>';
  }

  // フィルタ・検索・選択状態をリセット
  _materialFilter = 'all';
  _categoryFilter = 'all';
  _searchQuery = '';
  _showSelectedOnly = false;
  _checkedItems.clear();
  const searchEl = document.getElementById('ord-search-input');
  if (searchEl) searchEl.value = '';
  document.getElementById('ord-search-clear')?.toggleAttribute('hidden', true);
  const selectedToggle = document.getElementById('ord-show-selected');
  if (selectedToggle) selectedToggle.checked = false;
  document.querySelectorAll('#ord-material-tabs .ord-material-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === 'all');
  });
  renderCategoryTabs();
  const catSel = document.getElementById('ord-cat-select');
  if (catSel) catSel.value = 'all';
  switchOrderType('factory');

  const siteNameEl = document.getElementById('ord-site-name');
  if (siteNameEl) siteNameEl.value = '';

  const projectKeyEl = document.getElementById('ord-project-key');
  if (projectKeyEl) projectKeyEl.value = '';

  const noteEl = document.getElementById('ord-note');
  if (noteEl) noteEl.value = '';

  modal.classList.add('visible');
}

export function closeOrderModal() {
  const modal = document.getElementById('ord-modal');
  if (modal) modal.classList.remove('visible');
}

// 発注データを画面から収集して返す（バリデーション込み）
function collectOrderData() {
  const username = state.currentUsername || '未設定';
  const siteName = (document.getElementById('ord-site-name')?.value || '').trim();
  if (_orderType === 'site' && !siteName) {
    alert('現場名を入力してください。');
    document.getElementById('ord-site-name')?.focus();
    return null;
  }

  const selectedItems = [];

  // _checkedItems からマスタ品目を収集（フィルタ非表示の品目も取得できる）
  _checkedItems.forEach((saved, itemId) => {
    if (!saved.checked) return;
    const item = _items.find(it => it.id === itemId);
    if (!item) return;
    const length = saved.length || (item.availableLengths?.[0] || '');
    selectedItems.push({
      itemId, category: item.itemCategory || item.name || '',
      spec: item.spec, unit: '本', qty: saved.qty || 1,
      length, finish: saved.finish || ''
    });
  });

  // DOM上のカスタム品目を収集
  document.querySelectorAll('#ord-item-list .ord-item-row--custom').forEach(row => {
    const chk = row.querySelector('.ord-item-check');
    if (!chk?.checked) return;
    const name = row.querySelector('.ord-custom-name')?.value.trim();
    const spec = row.querySelector('.ord-custom-spec')?.value.trim() || '';
    const unit = row.querySelector('.ord-custom-unit')?.value.trim() || '本';
    const qty  = parseInt(row.querySelector('.ord-qty-input')?.value, 10) || 1;
    if (name) selectedItems.push({ itemId: null, category: name, spec, unit, qty, length: '', finish: '' });
  });

  if (selectedItems.length === 0) {
    alert('発注する鋼材を1つ以上選択してください。');
    return null;
  }

  const selEl = document.getElementById('ord-supplier-select');
  const supplier = _suppliers.find(s => s.id === selEl?.value) || _suppliers[0] || { id: '', name: '土屋鋼材株式会社', email: 'info@tsuchiyakouzai.com' };
  const projectKey = normalizeProjectKey(document.getElementById('ord-project-key')?.value || '');
  const note = document.getElementById('ord-note')?.value.trim() || '';

  return {
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierEmail: supplier.email,
    orderType: _orderType,
    siteName: _orderType === 'site' ? siteName : null,
    projectKey,
    items: selectedItems,
    orderedBy: username,
    note,
    _localNow: new Date()
  };
}

// プレビューモーダルを開く
let _pendingOrderData = null;
async function openPreviewModal() {
  const data = collectOrderData();
  if (!data) return;
  _pendingOrderData = data;

  const { subject, body, toEmail } = buildEmailContent({ ...data, orderedAt: data._localNow });

  document.getElementById('ord-preview-subject').textContent = subject;
  document.getElementById('ord-preview-to').textContent = toEmail;
  document.getElementById('ord-preview-body').textContent = body;

  document.getElementById('ord-modal').classList.remove('visible');
  document.getElementById('ord-preview-modal').classList.add('visible');
}

function closePreviewModal() {
  document.getElementById('ord-preview-modal').classList.remove('visible');
  document.getElementById('ord-modal').classList.add('visible');
}

// プレビューから実際に送信
async function submitFromPreview() {
  if (!_pendingOrderData) return;
  const data = _pendingOrderData;
  const nowLocal = data._localNow;
  const localOrderData = { ...data, orderedAt: nowLocal };
  const btn = document.getElementById('ord-preview-send');

  try {
    if (btn) { btn.disabled = true; btn.textContent = '送信中...'; }
    const ok = await sendOrderEmail(localOrderData);
    if (!ok) return;

    await addDoc(collection(db, 'orders'), buildStoredOrderData(data, { emailSent: true }));

    const usedIds = data.items.filter(it => it.itemId).map(it => it.itemId);
    if (usedIds.length) saveRecent(usedIds);
    alert('メールを送信しました。');
    document.getElementById('ord-preview-modal').classList.remove('visible');
    _pendingOrderData = null;
  } catch (err) {
    console.error('order: submitFromPreview error', err);
    document.getElementById('ord-preview-modal')?.classList.remove('visible');
    _pendingOrderData = null;
    alert('メール送信後の履歴保存に失敗しました。\n履歴に残っていない可能性があります。\n' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> この内容で送信';
    }
  }
}

function printDraftOrder() {
  const data = collectOrderData();
  if (!data) return;
  printOrder({ ...data, orderedAt: data._localNow });
  closeOrderModal();
}

// ===== 履歴モーダル =====
// 1年以上古い履歴と、30日を過ぎた削除済み履歴を自動削除（バックグラウンド実行）
async function purgeOldOrders() {
  try {
    const orderCutoff = new Date();
    orderCutoff.setFullYear(orderCutoff.getFullYear() - 1);
    const deletedCutoff = new Date();
    deletedCutoff.setDate(deletedCutoff.getDate() - 30);
    const snap = await getDocs(query(collection(db, 'orders'), where('orderedBy', '==', state.currentUsername)));
    const old = snap.docs.filter(d => {
      const data = d.data();
      const orderedAt = toDateValue(data.orderedAt);
      const deletedAt = toDateValue(data.deletedAt);
      if (deletedAt) return deletedAt < deletedCutoff;
      return orderedAt ? orderedAt < orderCutoff : false;
    });
    await Promise.all(old.map(d => deleteDoc(doc(db, 'orders', d.id))));
    if (old.length > 0) console.log(`order: ${old.length}件の期限切れ履歴を削除しました`);
  } catch (err) {
    console.warn('order: purgeOldOrders error', err);
  }
}

export async function openOrderHistoryModal() {
  _historyOffset = 0;
  state.orderHistoryProjectKeyFilter = '';
  await loadMasters();
  const modal = document.getElementById('ord-history-modal');
  if (!modal) return;
  modal.classList.add('visible');
  updateOrderHistoryFilterUi(0, 0);
  purgeOldOrders(); // バックグラウンドで古いデータを削除（完了を待たない）
  await renderHistory();
}

export function closeOrderHistoryModal() {
  const modal = document.getElementById('ord-history-modal');
  if (modal) modal.classList.remove('visible');
}

async function renderHistory() {
  const period = getPeriod(_historyOffset);
  const labelEl = document.getElementById('ord-period-label');
  if (labelEl) labelEl.textContent = fmtPeriodLabel(period);

  const listEl = document.getElementById('ord-history-list');
  if (!listEl) return;
  listEl.innerHTML = '<p class="ord-loading">読み込み中...</p>';

  try {
    const username = state.currentUsername;
    let q = state.isAdmin
      ? query(collection(db, 'orders'))
      : query(collection(db, 'orders'), where('orderedBy', '==', username));

    const snap = await getDocs(q);
    const orders = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(o => {
        const t = toDateValue(o.orderedAt);
        if (!t) return false;
        return t >= period.start && t <= period.end;
      })
      .sort((a, b) => {
        const ta = toDateValue(a.orderedAt) || new Date(0);
        const tb = toDateValue(b.orderedAt) || new Date(0);
        return tb - ta; // 新しい順
      });

    _historyOrders = orders.filter(order => !isOrderDeleted(order));
    _deletedHistoryOrders = orders
      .filter(order => isOrderDeleted(order))
      .sort((a, b) => {
        const ta = toDateValue(a.deletedAt) || new Date(0);
        const tb = toDateValue(b.deletedAt) || new Date(0);
        return tb - ta;
      });

    if (_historyOrders.length === 0 && _deletedHistoryOrders.length === 0) {
      listEl.innerHTML = '<p class="ord-empty">この期間の発注はありません</p>';
      return;
    }

    const grouped = {};
    _historyOrders.forEach(o => {
      const key = o.supplierName || '不明';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(o);
    });

    const activeHtml = _historyOrders.length > 0
      ? Object.entries(grouped).map(([supplierName, supplierOrders]) => `
          <div class="ord-history-group">
            <div class="ord-history-group-header">
              <i class="fa-solid fa-building"></i> ${esc(supplierName)}
              <span class="ord-history-count">${supplierOrders.length}件</span>
            </div>
            ${supplierOrders.map(order => renderHistoryItem(order)).join('')}
          </div>`).join('')
      : '<p class="ord-empty">この期間の表示中履歴はありません</p>';

    const deletedHtml = _deletedHistoryOrders.length > 0
      ? `
          <details class="ord-history-deleted-details">
            <summary class="ord-history-deleted-summary">
              <i class="fa-solid fa-trash-can-arrow-up"></i> 削除済み履歴（${_deletedHistoryOrders.length}件）
            </summary>
            <div class="ord-history-deleted-help">
              誤って削除した履歴はここから元に戻せます。削除済み履歴は30日後に自動で完全削除されます。
            </div>
            <div class="ord-history-deleted-list">
              ${_deletedHistoryOrders.map(order => renderHistoryItem(order, { deleted: true })).join('')}
            </div>
          </details>`
      : '';

    renderHistoryList();
  } catch (err) {
    console.error('order: renderHistory error', err);
    listEl.innerHTML = '<p class="ord-empty">読み込みに失敗しました</p>';
  }
}

// ===== 発注詳細モーダル =====
function renderHistoryList() {
  const listEl = document.getElementById('ord-history-list');
  if (!listEl) return;

  const totalCount = _historyOrders.length + _deletedHistoryOrders.length;
  const filteredActiveOrders = filterOrdersByProjectKey(_historyOrders);
  const filteredDeletedOrders = filterOrdersByProjectKey(_deletedHistoryOrders);
  const filteredCount = filteredActiveOrders.length + filteredDeletedOrders.length;
  updateOrderHistoryFilterUi(totalCount, filteredCount);

  if (totalCount === 0) {
    listEl.innerHTML = '<p class="ord-empty">この期間の発注はありません</p>';
    return;
  }
  if (filteredCount === 0) {
    listEl.innerHTML = '<p class="ord-empty">物件Noに一致する履歴はありません</p>';
    return;
  }

  const grouped = {};
  filteredActiveOrders.forEach(order => {
    const key = order.supplierName || '不明';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(order);
  });

  const activeHtml = filteredActiveOrders.length > 0
    ? Object.entries(grouped).map(([supplierName, supplierOrders]) => `
        <div class="ord-history-group">
          <div class="ord-history-group-header">
            <i class="fa-solid fa-building"></i> ${esc(supplierName)}
            <span class="ord-history-count">${supplierOrders.length}件</span>
          </div>
          ${supplierOrders.map(order => renderHistoryItem(order)).join('')}
        </div>`).join('')
    : '<p class="ord-empty">この条件の表示中履歴はありません</p>';

  const deletedHtml = filteredDeletedOrders.length > 0
    ? `
        <details class="ord-history-deleted-details">
          <summary class="ord-history-deleted-summary">
            <i class="fa-solid fa-trash-can-arrow-up"></i> 削除済み履歴（${filteredDeletedOrders.length}件）
          </summary>
          <div class="ord-history-deleted-help">
            誤って削除した履歴はここから元に戻せます。削除済み履歴は30日後に自動で完全削除されます。
          </div>
          <div class="ord-history-deleted-list">
            ${filteredDeletedOrders.map(order => renderHistoryItem(order, { deleted: true })).join('')}
          </div>
        </details>`
    : '';

  listEl.innerHTML = activeHtml + deletedHtml;
}

function openOrderDetailModal(orderId) {
  const order = findOrderById(orderId);
  if (!order) return;
  const modal = document.getElementById('ord-detail-modal');
  const content = document.getElementById('ord-detail-content');
  if (!modal || !content) return;

  const now = toDateValue(order.orderedAt) || new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const orderNo = `ORD-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${orderId.slice(-4).toUpperCase()}`;
  const supplier = _suppliers.find(s => s.id === order.supplierId) || { name: order.supplierName || '', address: '', tel: '' };
  const typeLabel = (!order.orderType || order.orderType === 'factory') ? '工場在庫' : (order.siteName || '現場名発注');
  const noteText = (order.note || '').trim() || '（なし）';
  const deletedInfo = isOrderDeleted(order)
    ? `<div class="ord-detail-deleted-banner"><i class="fa-solid fa-trash-can-arrow-up"></i> この履歴は削除済みです。${fmtDatetime(order.deletedAt)} に ${esc(order.deletedBy || '不明')} が削除しました。</div>`
    : '';
  const itemRows = (order.items || []).map((item, i) => {
    const nm = item.category || item.name || '';
    const fin = item.finish ? `　${item.finish}` : '';
    const len = item.length ? `　L=${item.length}` : '';
    return `<tr><td>${i+1}</td><td>${esc(nm)}　${esc(item.spec || '')}${fin}${len}</td><td>${item.qty}${esc(item.unit || '本')}</td></tr>`;
  }).join('');

  content.innerHTML = `
    <div class="ord-detail-doc">
      <div class="ord-detail-title">鋼 材 発 注 書</div>
      ${deletedInfo}
      <table class="ord-detail-meta">
        <tr><th>発注日時</th><td>${dateStr}</td></tr>
        <tr><th>発注番号</th><td>${orderNo}</td></tr>
        <tr><th>発注者</th><td>${esc(order.orderedBy || '')}（日建フレメックス株式会社 生産管理課）</td></tr>
        <tr><th>発注区分</th><td>${typeLabel}</td></tr>
        ${order.projectKey ? `<tr><th>物件No</th><td><span class="ord-project-key-chip">${esc(order.projectKey)}</span></td></tr>` : ''}
        <tr><th>メール送信</th><td>${order.emailSent ? `<span style="color:var(--accent-cyan)"><i class="fa-solid fa-envelope-circle-check"></i> 送信済み</span>` : `<span style="color:var(--accent-orange)"><i class="fa-solid fa-envelope"></i> 未送信（メール未送信）</span>`}</td></tr>
        ${isOrderDeleted(order) ? `<tr><th>削除状態</th><td>${fmtDatetime(order.deletedAt)} / ${esc(order.deletedBy || '不明')}</td></tr>` : ''}
      </table>
      <div class="ord-detail-section">【発注先】</div>
      <div class="ord-detail-supplier">
        <div>${esc(supplier.name)}</div>
        ${supplier.address ? `<div>${esc(supplier.address)}</div>` : ''}
        ${supplier.tel ? `<div>TEL: ${esc(supplier.tel)}</div>` : ''}
      </div>
      <div class="ord-detail-section">【発注明細】</div>
      <table class="ord-detail-items">
        <thead><tr><th>No.</th><th>品名・規格</th><th>数量</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div class="ord-detail-section">【備考】</div>
      <div class="ord-detail-note">${esc(noteText)}</div>
      <div class="ord-detail-footer">日建フレメックス株式会社 生産管理課</div>
    </div>`;

  modal.classList.add('visible');
  document.getElementById('ord-detail-print-btn')?.setAttribute('data-id', orderId);
  const deleteBtn = document.getElementById('ord-detail-delete-btn');
  const restoreBtn = document.getElementById('ord-detail-restore-btn');
  if (deleteBtn) {
    deleteBtn.dataset.id = orderId;
    deleteBtn.hidden = isOrderDeleted(order);
  }
  if (restoreBtn) {
    restoreBtn.dataset.id = orderId;
    restoreBtn.hidden = !isOrderDeleted(order);
  }
}

function closeOrderDetailModal() {
  document.getElementById('ord-detail-modal')?.classList.remove('visible');
}

async function deleteOrderHistory(orderId) {
  const order = findOrderById(orderId);
  if (!order || isOrderDeleted(order)) return;
  const summary = getOrderItemsSummary(order) || '発注明細';
  const ok = confirm(`この履歴を削除しますか？\n\n${summary}\n\n削除後も「削除済み履歴」から元に戻せます。`);
  if (!ok) return;

  try {
    await updateDoc(doc(db, 'orders', orderId), {
      deletedAt: serverTimestamp(),
      deletedBy: state.currentUsername || '不明'
    });
    closeOrderDetailModal();
    await renderHistory();
    alert('履歴を削除しました。誤って削除した場合は「削除済み履歴」から元に戻せます。');
  } catch (err) {
    console.error('order: deleteOrderHistory error', err);
    alert('履歴の削除に失敗しました。\n' + err.message);
  }
}

async function restoreOrderHistory(orderId) {
  const order = findOrderById(orderId);
  if (!order || !isOrderDeleted(order)) return;

  try {
    await updateDoc(doc(db, 'orders', orderId), {
      deletedAt: null,
      deletedBy: null
    });
    closeOrderDetailModal();
    await renderHistory();
    alert('履歴を元に戻しました。');
  } catch (err) {
    console.error('order: restoreOrderHistory error', err);
    alert('履歴の復元に失敗しました。\n' + err.message);
  }
}

// ===== 管理モーダル =====
export async function openOrderAdminModal() {
  const modal = document.getElementById('ord-admin-modal');
  if (!modal) return;
  await loadMasters();
  switchOrderAdminTab('items');
  modal.classList.add('visible');
}

export function closeOrderAdminModal() {
  const modal = document.getElementById('ord-admin-modal');
  if (modal) modal.classList.remove('visible');
}

async function openOrderAdminPanel() {
  await loadMasters();
  switchOrderAdminTab('items');
}

export function switchOrderAdminTab(tab) {
  ['items', 'suppliers', 'gas'].forEach(t => {
    const btn = document.getElementById(`ord-admin-tab-${t}`);
    const panel = document.getElementById(`ord-admin-panel-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
    if (panel) panel.hidden = (t !== tab);
  });
  if (tab === 'items') renderAdminItems();
  if (tab === 'suppliers') renderAdminSuppliers();
  if (tab === 'gas') renderAdminGas();
}

// --- 鋼材マスタ ---
function renderAdminItems() {
  const listEl = document.getElementById('ord-admin-items-list');
  if (!listEl) return;
  const visibleItems = _items.filter(it => it.active !== false);
  if (visibleItems.length === 0) {
    listEl.innerHTML = '<p class="ord-empty">登録なし</p>';
    return;
  }
  const matMap = { steel: 'S', stainless: 'SUS' };
  // カテゴリ別グループ表示
  const grouped = {};
  visibleItems.forEach(it => {
    const cat = it.itemCategory || it.name || '鋼材';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(it);
  });
  listEl.innerHTML = Object.entries(grouped).map(([cat, items]) => `
    <div class="ord-admin-cat-group">
      <div class="ord-admin-cat-header">${esc(cat)} <span class="ord-category-count">${items.length}件</span></div>
      ${items.map(item => `
        <div class="ord-admin-row" data-id="${esc(item.id)}">
          <span class="ord-admin-item-info">
            <strong>${esc(item.spec)}</strong>
            <span class="ord-mat-badge">${matMap[item.materialType || 'steel'] || 'S'}</span>
            <span class="ord-lengths-tag">${(item.availableLengths || []).join(' / ')}</span>
          </span>
          <div class="ord-admin-actions">
            <button class="btn-modal-secondary ord-admin-edit-item" data-id="${esc(item.id)}">編集</button>
            <button class="btn-modal-danger ord-admin-del-item" data-id="${esc(item.id)}">削除</button>
          </div>
        </div>`).join('')}
    </div>`).join('');
}

async function addOrUpdateItem(id, data) {
  try {
    if (id) {
      await updateDoc(doc(db, 'order_items', id), data);
    } else {
      await addDoc(collection(db, 'order_items'), { ...data, active: true });
    }
    await loadMasters();
    renderAdminItems();
  } catch (err) {
    alert('保存に失敗しました: ' + err.message);
  }
}

async function deleteItem(id) {
  if (!confirm('この鋼材を削除しますか？')) return;
  try {
    await updateDoc(doc(db, 'order_items', id), { active: false });
    await loadMasters();
    renderAdminItems();
  } catch (err) {
    alert('削除に失敗しました: ' + err.message);
  }
}

// --- 発注先 ---
function renderAdminSuppliers() {
  const listEl = document.getElementById('ord-admin-suppliers-list');
  if (!listEl) return;
  if (_suppliers.length === 0) {
    listEl.innerHTML = '<p class="ord-empty">登録なし</p>';
    return;
  }
  listEl.innerHTML = _suppliers.map(s => `
    <div class="ord-admin-row" data-id="${esc(s.id)}">
      <span class="ord-admin-item-info">
        <strong>${esc(s.name)}</strong>　${esc(s.email)}　${esc(s.tel || '')}
      </span>
      <div class="ord-admin-actions">
        <button class="btn-modal-secondary ord-admin-edit-supp" data-id="${esc(s.id)}">編集</button>
      </div>
    </div>`).join('');
}

// --- GAS設定 ---
function renderAdminGas() {
  const input = document.getElementById('ord-gas-url-input');
  if (input) input.value = _gasUrl;
}

async function saveGasUrl() {
  const input = document.getElementById('ord-gas-url-input');
  if (!input) return;
  const url = input.value.trim();
  try {
    await setDoc(doc(db, 'portal', 'config'), { gasOrderUrl: url }, { merge: true });
    _gasUrl = url;
    alert('GAS URLを保存しました。');
  } catch (err) {
    alert('保存に失敗しました: ' + err.message);
  }
}

// ===== イベントハンドラ登録 =====
function bindOrderEvents() {
  // 発注モーダル
  document.getElementById('ord-modal-close')?.addEventListener('click', closeOrderModal);
  document.getElementById('ord-btn-cancel')?.addEventListener('click', closeOrderModal);
  document.getElementById('ord-btn-history')?.addEventListener('click', () => {
    closeOrderModal();
    openOrderHistoryModal();
  });
  document.getElementById('ord-btn-email')?.addEventListener('click', openPreviewModal);
  document.getElementById('ord-btn-print')?.addEventListener('click', printDraftOrder);
  document.getElementById('ord-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('ord-modal')) closeOrderModal();
  });

  // プレビューモーダル
  document.getElementById('ord-preview-close')?.addEventListener('click', closePreviewModal);
  document.getElementById('ord-preview-back')?.addEventListener('click', closePreviewModal);
  document.getElementById('ord-preview-send')?.addEventListener('click', submitFromPreview);
  document.getElementById('ord-preview-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('ord-preview-modal')) closePreviewModal();
  });

  // 検索バー
  document.getElementById('ord-search-input')?.addEventListener('input', e => {
    _searchQuery = e.target.value;
    document.getElementById('ord-search-clear')?.toggleAttribute('hidden', !_searchQuery);
    renderOrderItemList();
  });
  document.getElementById('ord-search-clear')?.addEventListener('click', () => {
    _searchQuery = '';
    const el = document.getElementById('ord-search-input');
    if (el) { el.value = ''; el.focus(); }
    document.getElementById('ord-search-clear')?.toggleAttribute('hidden', true);
    renderOrderItemList();
  });

  // 選択済みのみ表示トグル
  document.getElementById('ord-show-selected')?.addEventListener('change', e => {
    _showSelectedOnly = e.target.checked;
    renderOrderItemList();
  });

  // カテゴリドロップダウン
  document.getElementById('ord-cat-select')?.addEventListener('change', e => {
    _categoryFilter = e.target.value;
    renderOrderItemList();
  });

  // 素材フィルタ
  document.getElementById('ord-material-tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.ord-material-tab');
    if (btn) switchMaterialFilter(btn.dataset.type);
  });

  // 発注区分トグル
  document.getElementById('ord-type-factory')?.addEventListener('click', () => switchOrderType('factory'));
  document.getElementById('ord-type-site')?.addEventListener('click', () => switchOrderType('site'));

  // この発注に品目追加
  document.getElementById('ord-add-custom-btn')?.addEventListener('click', () => {
    const listEl = document.getElementById('ord-item-list');
    if (!listEl) return;
    const row = document.createElement('div');
    row.className = 'ord-item-row ord-item-row--custom';
    row.innerHTML = `
      <input type="checkbox" class="ord-item-check" checked>
      <div class="ord-custom-inputs">
        <input type="text" class="form-input ord-custom-name" placeholder="品名" maxlength="40">
        <input type="text" class="form-input ord-custom-spec" placeholder="規格" maxlength="40">
        <input type="text" class="form-input ord-custom-unit" placeholder="単位" maxlength="10" style="width:60px">
      </div>
      <input type="number" class="ord-qty-input form-input" value="1" min="1" step="1">
      <button class="ord-custom-del-btn" title="削除"><i class="fa-solid fa-xmark"></i></button>
    `;
    row.querySelector('.ord-custom-del-btn').addEventListener('click', () => row.remove());
    listEl.appendChild(row);
    row.querySelector('.ord-custom-name').focus();
  });

  // 履歴詳細
  document.getElementById('ord-history-list')?.addEventListener('click', e => {
    const detailBtn = e.target.closest('.ord-history-detail-btn');
    if (detailBtn) {
      openOrderDetailModal(detailBtn.dataset.id);
      return;
    }
    const deleteBtn = e.target.closest('.ord-history-delete-btn');
    if (deleteBtn) {
      deleteOrderHistory(deleteBtn.dataset.id);
      return;
    }
    const restoreBtn = e.target.closest('.ord-history-restore-btn');
    if (restoreBtn) {
      restoreOrderHistory(restoreBtn.dataset.id);
    }
  });
  document.getElementById('ord-history-project-filter')?.addEventListener('input', e => {
    state.orderHistoryProjectKeyFilter = normalizeProjectKey(e.target.value || '');
    renderHistoryList();
  });
  document.getElementById('ord-history-project-filter-clear')?.addEventListener('click', () => {
    state.orderHistoryProjectKeyFilter = '';
    const input = document.getElementById('ord-history-project-filter');
    if (input) {
      input.value = '';
      input.focus();
    }
    renderHistoryList();
  });
  document.getElementById('ord-detail-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('ord-detail-modal')) closeOrderDetailModal();
  });
  document.getElementById('ord-detail-close')?.addEventListener('click', closeOrderDetailModal);
  document.getElementById('ord-detail-close2')?.addEventListener('click', closeOrderDetailModal);
  document.getElementById('ord-detail-print-btn')?.addEventListener('click', () => {
    const orderId = document.getElementById('ord-detail-print-btn')?.dataset.id;
    const order = findOrderById(orderId);
    if (order) {
      const now = toDateValue(order.orderedAt) || new Date();
      printOrder({ ...order, orderedAt: now, orderId });
    }
  });
  document.getElementById('ord-detail-delete-btn')?.addEventListener('click', () => {
    const orderId = document.getElementById('ord-detail-delete-btn')?.dataset.id;
    if (orderId) deleteOrderHistory(orderId);
  });
  document.getElementById('ord-detail-restore-btn')?.addEventListener('click', () => {
    const orderId = document.getElementById('ord-detail-restore-btn')?.dataset.id;
    if (orderId) restoreOrderHistory(orderId);
  });

  // 履歴モーダル
  const backToOrder = () => { closeOrderHistoryModal(); openOrderModal(); };
  document.getElementById('ord-history-close')?.addEventListener('click', backToOrder);
  document.getElementById('ord-history-cancel')?.addEventListener('click', backToOrder);
  document.getElementById('ord-history-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('ord-history-modal')) backToOrder();
  });
  document.getElementById('ord-period-prev')?.addEventListener('click', async () => {
    _historyOffset--;
    await renderHistory();
  });
  document.getElementById('ord-period-next')?.addEventListener('click', async () => {
    _historyOffset++;
    await renderHistory();
  });

  // 管理モーダル
  document.getElementById('ord-admin-close')?.addEventListener('click', closeOrderAdminModal);
  document.getElementById('ord-admin-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('ord-admin-modal')) closeOrderAdminModal();
  });

  // タブ切替
  ['items', 'suppliers', 'gas'].forEach(tab => {
    document.getElementById(`ord-admin-tab-${tab}`)?.addEventListener('click', () => switchOrderAdminTab(tab));
  });

  // 鋼材マスタ: 追加
  document.getElementById('ord-item-add-btn')?.addEventListener('click', async () => {
    const category = document.getElementById('ord-item-add-category')?.value.trim();
    const spec     = document.getElementById('ord-item-add-spec')?.value.trim() || '';
    const material = document.getElementById('ord-item-add-material')?.value || 'steel';
    const rawLen   = document.getElementById('ord-item-add-lengths')?.value.trim() || '';
    const lengths  = rawLen ? rawLen.split(/[,、\s]+/).map(s => s.trim()).filter(Boolean) : ['6m'];
    const ordType  = document.getElementById('ord-item-add-type')?.value || 'both';
    const suppId   = _suppliers[0]?.id || '';
    if (!category || !spec) { alert('品種とサイズは必須です。'); return; }
    await addOrUpdateItem(null, {
      itemCategory: category, name: category, spec, materialType: material,
      availableLengths: lengths, unit: '本', defaultQty: 1,
      orderType: ordType, supplierId: suppId, sortOrder: _items.length + 1
    });
    ['ord-item-add-category','ord-item-add-spec','ord-item-add-lengths'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  });

  // 鋼材マスタ: 編集・削除（委譲）
  document.getElementById('ord-admin-items-list')?.addEventListener('click', async e => {
    const editBtn = e.target.closest('.ord-admin-edit-item');
    const delBtn  = e.target.closest('.ord-admin-del-item');
    if (delBtn) {
      await deleteItem(delBtn.dataset.id);
    } else if (editBtn) {
      const id = editBtn.dataset.id;
      const item = _items.find(it => it.id === id);
      if (!item) return;
      const newCat = prompt('品種:', item.itemCategory || item.name);
      if (newCat === null) return;
      const newSpec = prompt('サイズ:', item.spec || '');
      if (newSpec === null) return;
      const newMat = prompt('素材 (steel=スチール / stainless=ステンレス):', item.materialType || 'steel');
      if (newMat === null) return;
      const newLengths = prompt('定尺（カンマ区切り）:', (item.availableLengths || []).join(','));
      if (newLengths === null) return;
      const lengths = newLengths.split(/[,、\s]+/).map(s => s.trim()).filter(Boolean);
      const newType = prompt('区分 (factory=工場在庫 / site=現場名発注 / both=両方):', item.orderType || 'both');
      if (newType === null) return;
      const validType = ['factory', 'site', 'both'].includes(newType) ? newType : 'both';
      const validMat = ['steel', 'stainless'].includes(newMat) ? newMat : 'steel';
      await addOrUpdateItem(id, {
        itemCategory: newCat, name: newCat, spec: newSpec,
        materialType: validMat, availableLengths: lengths,
        unit: '本', orderType: validType
      });
    }
  });

  // 発注先: 編集（委譲）
  document.getElementById('ord-admin-suppliers-list')?.addEventListener('click', async e => {
    const editBtn = e.target.closest('.ord-admin-edit-supp');
    if (!editBtn) return;
    const id = editBtn.dataset.id;
    const supp = _suppliers.find(s => s.id === id);
    if (!supp) return;
    const newName  = prompt('会社名:', supp.name);
    if (newName === null) return;
    const newEmail = prompt('メールアドレス:', supp.email);
    if (newEmail === null) return;
    const newTel   = prompt('電話番号:', supp.tel || '');
    if (newTel === null) return;
    const newAddr  = prompt('住所:', supp.address || '');
    if (newAddr === null) return;
    try {
      await updateDoc(doc(db, 'order_suppliers', id), { name: newName, email: newEmail, tel: newTel, address: newAddr });
      await loadMasters();
      renderAdminSuppliers();
    } catch (err) {
      alert('保存に失敗しました: ' + err.message);
    }
  });

  // 発注先: 追加
  document.getElementById('ord-supp-add-btn')?.addEventListener('click', async () => {
    const name  = document.getElementById('ord-supp-add-name')?.value.trim();
    const email = document.getElementById('ord-supp-add-email')?.value.trim();
    const tel   = document.getElementById('ord-supp-add-tel')?.value.trim() || '';
    const addr  = document.getElementById('ord-supp-add-addr')?.value.trim() || '';
    if (!name || !email) { alert('会社名とメールアドレスは必須です。'); return; }
    try {
      await addDoc(collection(db, 'order_suppliers'), {
        name, email, tel, address: addr, active: true, createdAt: serverTimestamp()
      });
      await loadMasters();
      renderAdminSuppliers();
      ['ord-supp-add-name','ord-supp-add-email','ord-supp-add-tel','ord-supp-add-addr'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    } catch (err) {
      alert('保存に失敗しました: ' + err.message);
    }
  });

  // GAS URL保存
  document.getElementById('ord-gas-save-btn')?.addEventListener('click', saveGasUrl);
}
