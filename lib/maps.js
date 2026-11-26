export function mapCoordinates(latitude, longitude) {
  if (latitude == null || longitude == null) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: lat, longitude: lng };
}

export function mapLinks(latitude, longitude) {
  const pointCoordinates = mapCoordinates(latitude, longitude);
  if (!pointCoordinates) return [];
  const { latitude: lat, longitude: lng } = pointCoordinates;
  const point = encodeURIComponent(lat + ',' + lng);
  return [
    ['Google Maps','https://www.google.com/maps/search/?api=1&query='+point],
    ['Yandex Maps','https://yandex.uz/maps/?pt='+encodeURIComponent(lng+','+lat)+'&z=16'],
    ['Apple Maps','https://maps.apple.com/?ll='+point+'&q=Do%27kon'],
  ];
}
