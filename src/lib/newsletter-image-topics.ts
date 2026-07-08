/**
 * Curated, pre-verified stock photo pool used to give AI-generated newsletters real
 * on-topic images. The AI can't fetch live URLs, so it picks a `topic` keyword instead
 * and this file resolves that into a known-working Unsplash photo.
 */
const img = (id: string) => `https://images.unsplash.com/photo-${id}?w=1200&q=80&auto=format&fit=crop`;

const TOPIC_IMAGES: Record<string, string[]> = {
  technology: [img("1517694712202-14dd9538aa97"), img("1518186285589-2f7649de83e0")],
  communication: [img("1611162617213-7d7a39e9b1d7"), img("1556742049-0cfed4f6a45d")],
  mobile: [img("1512941937669-90a1b58e7e9c"), img("1563986768609-322da13575f3")],
  business: [img("1522202176988-66273c2fd55f"), img("1454165804606-c3d57bc86b40")],
  marketing: [img("1556740738-b6a63e27c4df"), img("1573164713988-8665fc963095")],
  finance: [img("1554224155-6726b3ff858f"), img("1523240795612-9a054b0db644")],
  health: [img("1571902943202-507ec2618e8f"), img("1522252234503-e356532cafd5")],
  education: [img("1571019613454-1cb2f99b2d8b"), img("1580519542036-c47de6196ba5")],
  team: [img("1522202176988-66273c2fd55f"), img("1543269865-cbf427effbad")],
  celebration: [img("1533174072545-7a4b6ad7a6c3"), img("1546069901-ba9599a7e63c")],
  events: [img("1540575467063-178a50c2df87"), img("1556761175-5973dc0f32e7")],
  travel: [img("1571896349842-33c89424de2d"), img("1449824913935-59a10b8d2000")],
  food: [img("1498837167922-ddd27525d352"), img("1498050108023-c5249f4df085")],
  ecommerce: [img("1521737604893-d14cc237f11d"), img("1556740758-90de374c12ad")],
  security: [img("1516321497487-e288fb19713f"), img("1591696205602-2f950c417cb9")],
  fitness: [img("1590650046871-92c887180603"), img("1516534775068-ba3e7458af70")],
  "social-media": [img("1556909114-f6e7ad7d3136"), img("1607082349566-187342175e2f")],
  "customer-success": [img("1521791136064-7986c2920216"), img("1460925895917-afdab827c52f")],
  ai: [img("1556075798-4825dfaaf498"), img("1552664730-d307ca884978")],
  nature: [img("1506905925346-21bda4d32df4"), img("1556742212-5b321f3c261b")],
  product: [img("1553028826-f4804a6dba3b"), img("1600880292203-757bb62b4baf")],
};

export const NEWSLETTER_IMAGE_TOPICS = Object.keys(TOPIC_IMAGES);

/** Resolves a free-form AI-chosen topic into a real, working stock photo URL. */
export function pickImageForTopic(topic: string | undefined, seed = 0): string {
  const key = (topic || "").toLowerCase().trim();
  const bucket =
    TOPIC_IMAGES[key] ||
    Object.entries(TOPIC_IMAGES).find(([name]) => key.includes(name) || name.includes(key))?.[1] ||
    TOPIC_IMAGES.business;
  return bucket[Math.abs(seed) % bucket.length];
}
