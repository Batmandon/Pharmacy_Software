from decimal import Decimal, ROUND_HALF_UP


def selling_price(mrp: Decimal, discount_percent: Decimal) -> Decimal:
    return (mrp * (100 - discount_percent) / 100).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )