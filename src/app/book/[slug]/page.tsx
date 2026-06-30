import { notFound } from "next/navigation";
import { getBookingInfo, getBookingSlots } from "@/lib/queries/booking";
import { BookingView } from "@/components/booking/booking-view";

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const info = await getBookingInfo(slug);
  if (!info.exists) notFound();
  const { days } = await getBookingSlots(slug);
  return <BookingView slug={slug} hostName={info.hostName!} days={days} />;
}
