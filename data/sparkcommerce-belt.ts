export type SparkBeltWebTile = {
  id: string;
  image: string;
  title: string;
};

export const SPARK_BELT_IMAGE_SIZES = "35vh";

export function sparkBeltWebSrcSet(tile: SparkBeltWebTile) {
  const originalWidth = Number(tile.id.slice(4)) <= 7 ? 2880 : 1440;
  const base = tile.image.replace(/\.png$/, "");
  return `${base}-480.png 480w, ${base}-768.png 768w, ${base}-1024.png 1024w, ${tile.image} ${originalWidth}w`;
}

export type SparkBeltProduct = {
  id: string;
  name: string;
  image: string;
  rawImage: string;
};

/** 上轨:网页截图 01-08 */
export const sparkBeltLaneTop: SparkBeltWebTile[] = [
  { id: "web-01", image: "/projects/sparkcommerce/web-01.png", title: "落地页首屏" },
  { id: "web-02", image: "/projects/sparkcommerce/web-02.png", title: "创作工作室" },
  { id: "web-03", image: "/projects/sparkcommerce/web-03.png", title: "专业提示词" },
  { id: "web-04", image: "/projects/sparkcommerce/web-04.png", title: "积分定价" },
  { id: "web-05", image: "/projects/sparkcommerce/web-05.png", title: "个人中心" },
  { id: "web-06", image: "/projects/sparkcommerce/web-06.png", title: "登录页" },
  { id: "web-07", image: "/projects/sparkcommerce/web-07.png", title: "公司简介" },
  { id: "web-08", image: "/projects/sparkcommerce/web-08.png", title: "工作室·填词" },
];

/** 第三轨:网页截图 09-16 */
export const sparkBeltLaneMiddle: SparkBeltWebTile[] = [
  { id: "web-09", image: "/projects/sparkcommerce/web-09.png", title: "详情图模式" },
  { id: "web-10", image: "/projects/sparkcommerce/web-10.png", title: "社区" },
  { id: "web-11", image: "/projects/sparkcommerce/web-11.png", title: "下单成功" },
  { id: "web-12", image: "/projects/sparkcommerce/web-12.png", title: "效能数据" },
  { id: "web-13", image: "/projects/sparkcommerce/web-13.png", title: "三步流程" },
  { id: "web-14", image: "/projects/sparkcommerce/web-14.png", title: "作品图库" },
  { id: "web-15", image: "/projects/sparkcommerce/web-15.png", title: "联系我们" },
  { id: "web-16", image: "/projects/sparkcommerce/web-16.png", title: "注册页" },
];

/** 下轨:网页截图 17-24 */
export const sparkBeltLaneBottom: SparkBeltWebTile[] = [
  { id: "web-17", image: "/projects/sparkcommerce/web-17.png", title: "后台·卡密管理" },
  { id: "web-18", image: "/projects/sparkcommerce/web-18.png", title: "后台·用户列表" },
  { id: "web-19", image: "/projects/sparkcommerce/web-19.png", title: "后台·图片管理" },
  { id: "web-20", image: "/projects/sparkcommerce/web-20.png", title: "后台·订单管理" },
  { id: "web-21", image: "/projects/sparkcommerce/web-21.png", title: "社区视口" },
  { id: "web-22", image: "/projects/sparkcommerce/web-22.png", title: "图片灯箱" },
  { id: "web-23", image: "/projects/sparkcommerce/web-23.png", title: "工作室图库" },
  { id: "web-24", image: "/projects/sparkcommerce/web-24.png", title: "落地页演示区" },
];

/** 中轨:有白底图对照的产品图 */
export const sparkBeltProducts: SparkBeltProduct[] = [
  { id: "cup", name: "保温杯", image: "/projects/sparkcommerce/product-cup.webp", rawImage: "/projects/sparkcommerce/product-cup-raw.webp" },
  { id: "headphones", name: "无线耳机", image: "/projects/sparkcommerce/product-headphones.webp", rawImage: "/projects/sparkcommerce/product-headphones-raw.webp" },
  { id: "oil", name: "精华油", image: "/projects/sparkcommerce/product-oil.webp", rawImage: "/projects/sparkcommerce/product-oil-raw.webp" },
  { id: "shoes", name: "球鞋", image: "/projects/sparkcommerce/product-shoes.webp", rawImage: "/projects/sparkcommerce/product-shoes-raw.webp" },
  { id: "lamp", name: "台灯", image: "/projects/sparkcommerce/product-lamp.webp", rawImage: "/projects/sparkcommerce/product-lamp-raw.webp" },
  { id: "speaker", name: "音响", image: "/projects/sparkcommerce/product-speaker.webp", rawImage: "/projects/sparkcommerce/product-speaker-raw.webp" },
  { id: "watch", name: "智能手表", image: "/projects/sparkcommerce/product-watch.webp", rawImage: "/projects/sparkcommerce/product-watch-raw.webp" },
  { id: "toothbrush", name: "电动牙刷", image: "/projects/sparkcommerce/product-toothbrush.webp", rawImage: "/projects/sparkcommerce/product-toothbrush-raw.webp" },
];
