// Stand-in for the `opening_hours` package in the traffic sign recommender bundle.
// The converter only uses it to prettify time restrictions of `*:conditional` values
// (`normalizeTimeRestriction`); the real library is ~750 KB. Values stay as the mapper
// typed them in the sign (valid opening_hours syntax either way).
export default class OpeningHoursShim {
    constructor(value) {
        this.value = value;
    }

    prettifyValue() {
        return this.value;
    }
}
