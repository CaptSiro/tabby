<?php

namespace project;

use RuntimeException;

/**
 * Exchange rate could not be fetched, endpoints answer with 502 (see FinanceInvest::convert)
 */
class FinanceRateException extends RuntimeException {
    public function __construct(
        public readonly string $from,
        public readonly string $to
    ) {
        parent::__construct("Exchange rate $from -> $to could not be fetched");
    }
}
