import json

from django import template

register = template.Library()


@register.filter
def jsonify(value):
    """Serialize a Python object to a JSON string safe for HTML attribute values."""
    if value is None:
        return ""
    try:
        return json.dumps(value)
    except (TypeError, ValueError):
        return ""


@register.filter
def item_gst(item, default=18):
    """Return per-line GST from a quotation item dict without treating 0 as missing."""
    if not isinstance(item, dict):
        return default
    if "gst_percentage" in item and item["gst_percentage"] is not None:
        return item["gst_percentage"]
    if "gst" in item and item["gst"] is not None:
        return item["gst"]
    return default
