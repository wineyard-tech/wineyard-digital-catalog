import ProductDetailClient from '@/components/product/ProductDetailClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params
  return <ProductDetailClient id={id} />
}
