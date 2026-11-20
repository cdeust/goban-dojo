"""Convert the published Leela Zero #116 weights to an ONNX inference graph."""

import argparse
import gzip
import hashlib
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper


# The registry identifies networks by SHA-256 of the uncompressed text.
WEIGHTS_SHA256 = "39d465076ed1bdeaf4f85b35c2b569f604daa60076cbee9bbaab359f92a7c1c4"


def convert(source: Path, destination: Path) -> None:
    raw = gzip.decompress(source.read_bytes())
    if hashlib.sha256(raw).hexdigest() != WEIGHTS_SHA256:
        raise ValueError("Expected official Leela Zero network #116")
    version, *lines = raw.splitlines()
    if version != b"1":
        raise ValueError("Expected Leela Zero side-to-play value format v1")
    weights = iter(lines)
    nodes = []
    initializers = []

    def weight(name, shape):
        array = np.fromstring(next(weights).decode("ascii"), dtype=np.float32, sep=" ")
        initializers.append(numpy_helper.from_array(array.reshape(shape), name))
        return name

    def op(kind, name, *inputs, **attributes):
        nodes.append(helper.make_node(kind, inputs, [name], name=name, **attributes))
        return name

    def conv_bn(name, x, channels_in, channels_out, kernel):
        weights_name = weight(name + "_w", (channels_out, channels_in, kernel, kernel))
        bias = weight(name + "_b", (channels_out,))
        mean = weight(name + "_mean", (channels_out,))
        variance = weight(name + "_variance", (channels_out,))
        scale = name + "_scale"
        shift = name + "_shift"
        initializers.append(
            numpy_helper.from_array(np.ones(channels_out, np.float32), scale)
        )
        initializers.append(
            numpy_helper.from_array(np.zeros(channels_out, np.float32), shift)
        )
        conv = op("Conv", name + "_conv", x, weights_name, bias, pads=[kernel // 2] * 4)
        return op(
            "BatchNormalization",
            name + "_bn",
            conv,
            scale,
            shift,
            mean,
            variance,
            epsilon=1e-5,
        )

    def dense(name, x, inputs, outputs):
        matrix = weight(name + "_w", (outputs, inputs))
        bias = weight(name + "_b", (outputs,))
        return op("Gemm", name, x, matrix, bias, transB=1)

    side = 19
    area = side * side
    channels = 128
    x = op("Relu", "input_relu", conv_bn("input", "board", 18, channels, 3))
    for block in range(10):
        name = f"res{block}"
        a = conv_bn(name + "_a", x, channels, channels, 3)
        a = op("Relu", name + "_relu_a", a)
        b = conv_bn(name + "_b", a, channels, channels, 3)
        x = op("Relu", name + "_out", op("Add", name + "_add", x, b))

    policy = conv_bn("policy_head", x, channels, 2, 1)
    policy = op("Flatten", "policy_flat", op("Relu", "policy_relu", policy), axis=1)
    dense("policy", policy, 2 * area, area + 1)

    value = conv_bn("value_head", x, channels, 1, 1)
    value = op("Flatten", "value_flat", op("Relu", "value_relu", value), axis=1)
    value = op("Relu", "value_hidden_relu", dense("value_hidden", value, area, 256))
    op("Tanh", "value", dense("value_scalar", value, 256, 1))
    if next(weights, None) is not None:
        raise ValueError("Unexpected trailing weights")

    def tensor(name, shape):
        return helper.make_tensor_value_info(name, TensorProto.FLOAT, shape)

    graph = helper.make_graph(
        nodes,
        "Leela Zero #116",
        [tensor("board", [1, 18, side, side])],
        [tensor("policy", [1, area + 1]), tensor("value", [1, 1])],
        initializer=initializers,
    )
    model = helper.make_model(
        graph,
        producer_name="shusaku-goban",
        opset_imports=[helper.make_opsetid("", 13)],
        ir_version=7,
    )
    onnx.checker.check_model(model)
    destination.write_bytes(model.SerializeToString(deterministic=True))
    print(
        f"{destination.stat().st_size} bytes, SHA-256 {hashlib.sha256(destination.read_bytes()).hexdigest()}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("weights_gz", type=Path)
    parser.add_argument("output_onnx", type=Path)
    args = parser.parse_args()
    convert(args.weights_gz, args.output_onnx)
