.PHONY: up down reset seed perf test test-public grade report
up down reset seed test test-public grade report:
	npm run $@
SCALE ?= 100000
SEED ?= 17
perf:
	npm run perf -- $(SCALE) $(SEED)
