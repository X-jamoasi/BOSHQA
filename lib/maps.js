export function mapLinks(latitude, longitude) {
  if (latitude == null || longitude == null) return [];
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
  const point = encodeURIComponent(lat + ',' + lng);
  return [
    ['Google Maps','https://www.google.com/maps/search/?api=1&query='+point],
    ['Yandex Maps','https://yandex.uz/maps/?pt='+encodeURIComponent(lng+','+lat)+'&z=16'],
    ['Apple Maps','https://maps.apple.com/?ll='+point+'&q=Do%27kon'],
  ];
}
